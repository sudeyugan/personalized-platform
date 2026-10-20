//! Purpose-specific native key sealing. No command returns an API key or private key.
use crate::repositories::SecretRepository;
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use hkdf::Hkdf;
use p256::{
    PublicKey, SecretKey,
    ecdh::diffie_hellman,
    pkcs8::{DecodePublicKey, EncodePublicKey},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, WebviewWindow};

pub(crate) const IMPORT: &str = "device-config-import";
const IDENTITY: &str = "device-config-identity";
const MODEL: &str = "companion-provider";
const VOICE: &str = "companion-voice-elevenlabs";
pub(crate) const FAILURE: &str = "配置交接失败；原配置保留。请核对设备、范围与兼容服务。";

fn public_key(key: &SecretKey) -> Result<String, String> {
    key.public_key()
        .to_public_key_der()
        .map(|der| B64.encode(der.as_bytes()))
        .map_err(|_| FAILURE.into())
}
fn derive(key: &SecretKey, peer: &str, context: &str) -> Result<Aes256Gcm, String> {
    let bytes = B64.decode(peer).map_err(|_| FAILURE)?;
    let peer = PublicKey::from_public_key_der(&bytes).map_err(|_| FAILURE)?;
    let shared = diffie_hellman(key.to_nonzero_scalar(), peer.as_affine());
    let mut output = [0u8; 32];
    Hkdf::<Sha256>::new(
        Some(&Sha256::digest(context.as_bytes())),
        shared.raw_secret_bytes(),
    )
    .expand(b"yiyu-config-v1", &mut output)
    .map_err(|_| FAILURE)?;
    Aes256Gcm::new_from_slice(&output).map_err(|_| FAILURE.into())
}
pub(crate) fn context(value: &str) -> Result<Value, String> {
    if value.len() > 1600 {
        return Err(FAILURE.into());
    }
    let data: Value = serde_json::from_str(value).map_err(|_| FAILURE)?;
    let array = data.as_array().ok_or(FAILURE)?;
    if array.len() != 8
        || array[0] != 1
        || !array[5].as_u64().is_some_and(|n| n > 0)
        || ![1, 2, 3, 4].iter().all(|&i| {
            array[i].as_str().is_some_and(|s| {
                s.len() == 36 && s.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-')
            })
        })
        || !array[6].as_array().is_some_and(|items| {
            !items.is_empty()
                && items.len() <= 2
                && items.iter().all(|s| s == "model" || s == "voice")
                && !(items.len() == 2 && items[0] == items[1])
        })
    {
        return Err(FAILURE.into());
    }
    Ok(data)
}
fn validate(payload: &Value, bound: &Value) -> Result<(), String> {
    let object = payload.as_object().ok_or(FAILURE)?;
    if object.is_empty() || object.len() > 2 {
        return Err(FAILURE.into());
    }
    for (scope, value) in object {
        if !bound[6].as_array().ok_or(FAILURE)?.contains(&json!(scope)) {
            return Err(FAILURE.into());
        }
        let key = value["key"].as_str().ok_or(FAILURE)?;
        if key.is_empty() || key.len() > 500 || key.chars().any(|c| c.is_control()) {
            return Err(FAILURE.into());
        }
        match scope.as_str() {
            "model"
                if value["model"] == "deepseek-chat" || value["model"] == "deepseek-reasoner" => {}
            "voice"
                if value["voice"].as_str().is_some_and(|s| {
                    (10..=100).contains(&s.len())
                        && s.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                }) && ["scribe_v1", "scribe_v2"]
                    .contains(&value["sttModel"].as_str().unwrap_or(""))
                    && [
                        "eleven_multilingual_v2",
                        "eleven_flash_v2_5",
                        "eleven_turbo_v2_5",
                    ]
                    .contains(&value["ttsModel"].as_str().unwrap_or("")) => {}
            _ => return Err(FAILURE.into()),
        }
        let expected = if scope == "model" { 2 } else { 4 };
        if value.as_object().ok_or(FAILURE)?.len() != expected {
            return Err(FAILURE.into());
        }
    }
    if object.len() != bound[6].as_array().ok_or(FAILURE)?.len() {
        return Err(FAILURE.into());
    }
    Ok(())
}
fn sanitized(payload: &Value) -> Value {
    let mut result = payload.clone();
    if let Some(scopes) = result.as_object_mut() {
        for value in scopes.values_mut() {
            if let Some(config) = value.as_object_mut() {
                config.remove("key");
            }
        }
    }
    result
}
fn packet_digest(context: &str, packet: &Value) -> Result<String, String> {
    let material = [
        context,
        packet["ephemeral"].as_str().ok_or(FAILURE)?,
        packet["iv"].as_str().ok_or(FAILURE)?,
        packet["body"].as_str().ok_or(FAILURE)?,
    ]
    .join("\n");
    Ok(B64.encode(Sha256::digest(material.as_bytes())))
}
fn scoped(payload: &Value, bound: &Value) -> Value {
    let mut value = payload.clone();
    if let Some(object) = value.as_object_mut() {
        object.retain(|key, _| {
            bound[6]
                .as_array()
                .is_some_and(|items| items.contains(&json!(key)))
        });
    }
    sanitized(&value)
}
fn identity(repository: &SecretRepository) -> Result<SecretKey, String> {
    if let Some(raw) = repository.raw_load(IDENTITY)? {
        return SecretKey::from_slice(&B64.decode(raw).map_err(|_| FAILURE)?)
            .map_err(|_| FAILURE.into());
    }
    let key = SecretKey::random(&mut OsRng);
    repository.raw_store(IDENTITY, &B64.encode(key.to_bytes()))?;
    Ok(key)
}
pub(crate) fn imported(repository: &SecretRepository) -> Result<Option<Value>, String> {
    repository
        .raw_load(IMPORT)?
        .map(|raw| serde_json::from_str(&raw).map_err(|_| FAILURE.into()))
        .transpose()
}
pub(crate) fn imported_key(
    repository: &SecretRepository,
    id: &str,
) -> Result<Option<String>, String> {
    let scope = match id {
        MODEL => "model",
        VOICE => "voice",
        _ => return Ok(None),
    };
    Ok(imported(repository)?
        .and_then(|value| value["payload"][scope]["key"].as_str().map(str::to_owned)))
}
pub(crate) fn remove_scope(repository: &SecretRepository, id: &str) -> Result<(), String> {
    let scope = match id {
        MODEL => "model",
        VOICE => "voice",
        _ => return Ok(()),
    };
    if let Some(mut current) = imported(repository)? {
        if let Some(payload) = current["payload"].as_object_mut() {
            payload.remove(scope);
        }
        // Local edits also block a late update for this request, until explicitly re-requested.
        current["detached"] = json!(true);
        repository.raw_store(IMPORT, &current.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn device_config_native(
    window: WebviewWindow,
    app: AppHandle,
    operation: String,
    input: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("配置交接仅限主窗口".into());
    }
    let repository = SecretRepository::from_app(&app)?;
    if operation == "authorize" {
        return crate::config_handoff_grants::authorize(&window, &repository, &input);
    }
    native(&repository, &operation, input).map_err(|_| FAILURE.into())
}
fn native(repository: &SecretRepository, operation: &str, input: Value) -> Result<Value, String> {
    match operation {
        "identity" => Ok(json!(public_key(&identity(repository)?)?)),
        "state" => Ok(imported(repository)?.map(|record| json!({"request":record["request"],"sequence":record["sequence"],"detached":record["detached"] == true})).unwrap_or(json!({}))),
        "available" => {
            let mut payload = input;
            if let Some(object) = payload.as_object_mut() {
                object.retain(|scope, _| ["model", "voice"].contains(&scope.as_str()));
                for (scope, config) in object.iter_mut() {
                    let id = if scope == "model" { MODEL } else { VOICE };
                    if let Some(key) = repository.load(id)? { config["key"] = json!(key); }
                }
                object.retain(|_, config| config["key"].is_string());
            }
            let bound = json!([1, "", "", "", "", 1, payload.as_object().ok_or(FAILURE)?.keys().collect::<Vec<_>>(), ""]);
            if payload.as_object().is_some_and(|v| !v.is_empty()) { validate(&payload, &bound)?; }
            let mut safe = sanitized(&payload);
            // High-entropy Key digest is local-only change detection, never uploaded to the hub.
            safe["revision"] = json!(B64.encode(Sha256::digest(payload.to_string().as_bytes())));
            Ok(safe)
        },
        "seal" => {
            let text = input["context"].as_str().ok_or(FAILURE)?;
            let bound = context(text)?;
            crate::config_handoff_grants::check(repository, &bound)?;
            let mut payload = input["config"].clone();
            for (scope, config) in payload.as_object_mut().ok_or(FAILURE)? {
                let id = match scope.as_str() { "model" => MODEL, "voice" => VOICE, _ => return Err(FAILURE.into()) };
                config["key"] = json!(crate::config_handoff_grants::key(repository, &bound, scope, id)?);
            }
            validate(&payload, &bound)?;
            let ephemeral = SecretKey::random(&mut OsRng);
            let cipher = derive(&ephemeral, bound[7].as_str().ok_or(FAILURE)?, text)?;
            let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
            let body = cipher.encrypt(&nonce, Payload { msg: payload.to_string().as_bytes(), aad: text.as_bytes() }).map_err(|_| FAILURE)?;
            Ok(json!({"ephemeral":public_key(&ephemeral)?,"iv":B64.encode(nonce),"body":B64.encode(body)}))
        },
        "apply" => {
            let text = input["context"].as_str().ok_or(FAILURE)?;
            let bound = context(text)?;
            let key = identity(repository)?;
            if bound[7] != public_key(&key)? { return Err(FAILURE.into()); }
            if let Some(previous) = imported(repository)? {
                if previous["request"] == bound[2] {
                    if previous["detached"] == true || previous["sequence"].as_u64().unwrap_or(0) > bound[5].as_u64().unwrap_or(0) || previous["source"] != bound[3] { return Err(FAILURE.into()); }
                    if previous["sequence"] == bound[5] {
                        if previous["digest"] != packet_digest(text, &input["packet"])? { return Err(FAILURE.into()); }
                        return Ok(scoped(&previous["payload"], &bound));
                    }
                }
            }
            let packet = &input["packet"];
            let body = packet["body"].as_str().ok_or(FAILURE)?;
            if body.len() > 12000 { return Err(FAILURE.into()); }
            let iv = B64.decode(packet["iv"].as_str().ok_or(FAILURE)?).map_err(|_| FAILURE)?;
            if iv.len() != 12 { return Err(FAILURE.into()); }
            let cipher = derive(&key, packet["ephemeral"].as_str().ok_or(FAILURE)?, text)?;
            let plain = cipher.decrypt(Nonce::from_slice(&iv), Payload { msg: &B64.decode(body).map_err(|_| FAILURE)?, aad: text.as_bytes() }).map_err(|_| FAILURE)?;
            let payload: Value = serde_json::from_slice(&plain).map_err(|_| FAILURE)?;
            validate(&payload, &bound)?;
            // Unselected services retain their current imported credentials when re-requesting a subset.
            let mut stored_payload = imported(repository)?.map(|previous| previous["payload"].clone()).unwrap_or(json!({}));
            for (scope, value) in payload.as_object().ok_or(FAILURE)? { stored_payload[scope] = value.clone(); }
            let digest = packet_digest(text, packet)?;
            let record = json!({"request":bound[2],"source":bound[3],"sequence":bound[5],"digest":digest,"payload":stored_payload});
            // One protected file commit switches all imported scopes together.
            repository.raw_store(IMPORT, &record.to_string())?;
            Ok(sanitized(&payload))
        },
        "revoke" => {
            crate::config_handoff_grants::revoke(repository, input["context"].as_str().ok_or(FAILURE)?)?;
            Ok(json!(true))
        },
        "revoke-all" => { crate::config_handoff_grants::clear(repository)?; Ok(json!(true)) },
        "detach" => {
            if let Some(mut record) = imported(repository)? {
                record["detached"] = json!(true);
                repository.raw_store(IMPORT, &record.to_string())?;
            }
            Ok(json!(true))
        },
        _ => Err(FAILURE.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_ecdh_authenticates_context_and_rejects_other_recipient() {
        let receiver = SecretKey::random(&mut OsRng);
        let ephemeral = SecretKey::random(&mut OsRng);
        let aad = "bound-context";
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let cipher = derive(&ephemeral, &public_key(&receiver).unwrap(), aad).unwrap();
        let sealed = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: b"fictional-key",
                    aad: aad.as_bytes(),
                },
            )
            .unwrap();
        let decrypt = derive(&receiver, &public_key(&ephemeral).unwrap(), aad).unwrap();
        assert_eq!(
            decrypt
                .decrypt(
                    &nonce,
                    Payload {
                        msg: &sealed,
                        aad: aad.as_bytes()
                    }
                )
                .unwrap(),
            b"fictional-key"
        );
        assert!(
            decrypt
                .decrypt(
                    &nonce,
                    Payload {
                        msg: &sealed,
                        aad: b"wrong-context"
                    }
                )
                .is_err()
        );
        assert!(
            derive(
                &SecretKey::random(&mut OsRng),
                &public_key(&ephemeral).unwrap(),
                aad
            )
            .unwrap()
            .decrypt(&nonce, sealed.as_ref())
            .is_err()
        );
    }
    #[test]
    fn rejects_endpoints_and_extra_secret_scopes() {
        let bound = json!([1, "", "", "", "", 1, ["model"], ""]);
        assert!(
            validate(
                &json!({"model":{"key":"fictional","model":"deepseek-chat"}}),
                &bound
            )
            .is_ok()
        );
        assert!(validate(&json!({"model":{"key":"fictional","model":"deepseek-chat","endpoint":"https://evil.example"}}), &bound).is_err());
        assert!(validate(&json!({"voice":{"key":"fictional"}}), &bound).is_err());
    }
    #[test]
    fn matches_jca_node_vector() {
        // Public fixture only: P-256 scalar 1, peer scalar 2, zero test IV.
        let mut scalar = [0u8; 32];
        scalar[31] = 1;
        let key = SecretKey::from_slice(&scalar).unwrap();
        let peer = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfPJ7GI0DT36KUjgDBLUaw8CJaeJ38hs1pgtI/EdmmXgHd1UQ247QQCk9msafdDDbun2t5jzpgimeBLedInhz0Q==";
        let cipher = derive(&key, peer, "bound-context").unwrap();
        let bytes = B64
            .decode("UafH5ND0bblcAuyBwT69SDn6Glnjw6JfNQqMkm8=")
            .unwrap();
        assert_eq!(
            cipher
                .decrypt(
                    Nonce::from_slice(&[0u8; 12]),
                    Payload {
                        msg: &bytes,
                        aad: b"bound-context"
                    }
                )
                .unwrap(),
            b"fictional-key"
        );
    }
    #[cfg(windows)]
    #[test]
    fn native_protected_import_is_atomic_replay_safe_and_respects_local_override() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let source = SecretRepository::for_test(a.path().join("secrets"));
        let target = SecretRepository::for_test(b.path().join("secrets"));
        target.raw_store(IMPORT, &json!({"request":"earlier-request","source":"earlier-source","sequence":1,"payload":{"voice":{"key":"retained-fictional-voice","voice":"fictionalVoiceId","sttModel":"scribe_v2","ttsModel":"eleven_multilingual_v2"}}}).to_string()).unwrap();
        source.store(MODEL, "fictional-provider-value").unwrap();
        let public = native(&target, "identity", json!({})).unwrap();
        let bound = json!([
            1,
            "11111111-1111-4111-a111-111111111111",
            "22222222-2222-4222-a222-222222222222",
            "33333333-3333-4333-a333-333333333333",
            "44444444-4444-4444-a444-444444444444",
            1,
            ["model"],
            public
        ]);
        let text = bound.to_string();
        assert!(
            native(
                &source,
                "seal",
                json!({"context":text,"config":{"model":{"model":"deepseek-chat"}}})
            )
            .is_err()
        );
        crate::config_handoff_grants::grant(&source, &bound, false).unwrap();
        // One-time consent captures the current key, never a later rotation.
        source
            .store(MODEL, "rotated-fictional-provider-value")
            .unwrap();
        let mut wrong_target = bound.clone();
        wrong_target[4] = json!("55555555-5555-4555-a555-555555555555");
        assert!(crate::config_handoff_grants::check(&source, &wrong_target).is_err());
        let packet = native(
            &source,
            "seal",
            json!({"context":text,"config":{"model":{"model":"deepseek-chat"}}}),
        )
        .unwrap();
        assert!(!packet.to_string().contains("fictional-provider-value"));
        let applied = native(&target, "apply", json!({"context":text,"packet":packet})).unwrap();
        assert_eq!(applied, json!({"model":{"model":"deepseek-chat"}}));
        assert_eq!(
            target.load(MODEL).unwrap().unwrap(),
            "fictional-provider-value"
        );
        assert!(target.has(MODEL).unwrap());
        assert_eq!(
            target.load(VOICE).unwrap().unwrap(),
            "retained-fictional-voice"
        );
        native(&target, "apply", json!({"context":text,"packet":packet})).unwrap();
        let mut altered = packet.clone();
        altered["body"] = json!("A".repeat(48));
        assert!(native(&target, "apply", json!({"context":text,"packet":altered})).is_err());
        target.store(MODEL, "independent-local-value").unwrap();
        assert_eq!(
            target.load(MODEL).unwrap().unwrap(),
            "independent-local-value"
        );
        assert!(native(&target, "apply", json!({"context":text,"packet":packet})).is_err());
        for path in std::fs::read_dir(b.path().join("secrets")).unwrap() {
            assert!(
                !String::from_utf8_lossy(&std::fs::read(path.unwrap().path()).unwrap())
                    .contains("fictional-provider-value")
            );
        }
        target.delete(MODEL).unwrap();
        assert!(!target.has(MODEL).unwrap());
        crate::config_handoff_grants::revoke(&source, &text).unwrap();
        assert!(
            native(
                &source,
                "seal",
                json!({"context":text,"config":{"model":{"model":"deepseek-chat"}}})
            )
            .is_err()
        );
        assert!(source.store("device-config-grants", "forged").is_err());
    }
}
