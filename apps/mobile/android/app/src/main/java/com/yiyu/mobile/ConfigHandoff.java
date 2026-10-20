package com.yiyu.mobile;

import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.Iterator;
import javax.crypto.Cipher;
import org.json.*;

/** Local-only bridge: never returns API keys or the ECDH private key to JavaScript. */
final class ConfigHandoff {
    static final String IMPORT = "yiyu-config-import-v1", IDENTITY = "yiyu-config-identity-v1";
    private static final Object LOCK = new Object();
    static JSONObject record(Context context) throws Exception {
        return SecretStore.existsRaw(context, IMPORT) ? new JSONObject(SecretStore.readRaw(context, IMPORT)) : null;
    }
    static String importedKey(Context context, String alias) throws Exception {
        String scope = SecretStore.MODEL.equals(alias) ? "model" : SecretStore.VOICE.equals(alias) ? "voice" : null;
        if (scope == null) return null;
        JSONObject record = record(context), item = record == null ? null : record.getJSONObject("payload").optJSONObject(scope);
        return item == null ? null : item.getString("key");
    }
    static String setting(Context context, String scope, String field, String fallback) {
        try { JSONObject record = record(context), item = record == null ? null : record.getJSONObject("payload").optJSONObject(scope); String local = context.getSharedPreferences("model".equals(scope) ? SecretStore.MODEL : SecretStore.VOICE,0).getString(field,fallback); return item == null ? local : item.optString(field, local); }
        catch (Exception error) { return fallback; }
    }
    static void localOverride(Context context, String alias) throws Exception {
        if (!SecretStore.MODEL.equals(alias) && !SecretStore.VOICE.equals(alias)) return;
        synchronized (LOCK) {
            JSONObject record = record(context);
            if (record == null) return;
            String scope = SecretStore.MODEL.equals(alias) ? "model" : "voice";
            JSONObject previous = record.getJSONObject("payload").optJSONObject(scope);
            if (previous != null) {
                android.content.SharedPreferences.Editor local = context.getSharedPreferences(alias,0).edit();
                // Changing only a key must not reset an imported model/voice-engine choice.
                for (String field : "model".equals(scope) ? new String[]{"model"} : new String[]{"sttModel","ttsModel"}) local.putString(field,previous.getString(field));
                if (!local.commit()) throw new Exception("public settings save failed");
            }
            record.getJSONObject("payload").remove(SecretStore.MODEL.equals(alias) ? "model" : "voice");
            record.put("detached", true);
            SecretStore.saveRaw(context, IMPORT, record.toString(), null);
        }
    }
    private static JSONObject identity(Context context) throws Exception {
        if (SecretStore.existsRaw(context, IDENTITY)) return new JSONObject(SecretStore.readRaw(context, IDENTITY));
        KeyPair key = ConfigCrypto.generate();
        JSONObject value = new JSONObject().put("private", ConfigCrypto.encode(key.getPrivate().getEncoded())).put("public", ConfigCrypto.encode(key.getPublic().getEncoded()));
        SecretStore.saveRaw(context, IDENTITY, value.toString(), null);
        return value;
    }
    static JSONArray context(String text) throws Exception {
        if (text.length() > 1600) throw new Exception("context limit");
        JSONArray value = new JSONArray(text);
        if (value.length() != 8 || value.getInt(0) != 1 || value.getLong(5) < 1) throw new Exception("context invalid");
        for (int i = 1; i <= 4; i++) if (!value.getString(i).matches("[a-f0-9-]{36}")) throw new Exception("identity invalid");
        JSONArray scopes = value.getJSONArray(6);
        if (scopes.length() < 1 || scopes.length() > 2) throw new Exception("scope invalid");
        if (scopes.length() == 2 && scopes.getString(0).equals(scopes.getString(1))) throw new Exception("duplicate scope");
        for (int i = 0; i < scopes.length(); i++) if (!"model".equals(scopes.getString(i)) && !"voice".equals(scopes.getString(i))) throw new Exception("scope invalid");
        return value;
    }
    private static JSONObject safe(JSONObject payload) throws Exception {
        JSONObject result = new JSONObject(payload.toString());
        Iterator<String> keys = result.keys();
        while (keys.hasNext()) result.getJSONObject(keys.next()).remove("key");
        return result;
    }
    private static JSONObject scoped(JSONObject payload, JSONArray scopes) throws Exception {
        JSONObject result = new JSONObject();
        for (int i=0;i<scopes.length();i++) result.put(scopes.getString(i),payload.getJSONObject(scopes.getString(i)));
        return safe(result);
    }
    private static void validate(JSONObject payload, JSONArray scopes) throws Exception {
        if (payload.length() != scopes.length() || scopes.length() < 1 || scopes.length() > 2) throw new Exception("scope mismatch");
        for (int index = 0; index < scopes.length(); index++) {
            String scope = scopes.getString(index); JSONObject config = payload.getJSONObject(scope); String key = config.getString("key");
            if (key.isEmpty() || key.length() > 500 || key.chars().anyMatch(Character::isISOControl)) throw new Exception("invalid key");
            if ("model".equals(scope)) {
                if (config.length() != 2 || !config.getString("model").matches("deepseek-(chat|reasoner)")) throw new Exception("unsupported model");
            } else if ("voice".equals(scope)) {
                if (config.length() != 4 || !config.getString("voice").matches("[A-Za-z0-9_-]{10,100}")
                    || !config.getString("sttModel").matches("scribe_v[12]")
                    || !config.getString("ttsModel").matches("eleven_(multilingual_v2|flash_v2_5|turbo_v2_5)")) throw new Exception("unsupported voice");
            } else throw new Exception("unsupported scope");
        }
    }
    static String run(Context context, String operation, String raw) {
        synchronized (LOCK) {
            try {
                if (raw == null || raw.length() > 20000) throw new Exception("size limit");
                JSONObject input = new JSONObject(raw); Object output;
                switch (operation) {
                    case "authorize": output = ConfigGrants.authorize(context,input); break;
                    case "revoke": ConfigGrants.revoke(context,input.getString("context")); output=true; break;
                    case "identity": output = identity(context).getString("public"); break;
                    case "state": { JSONObject value = record(context); output = value == null ? new JSONObject() : new JSONObject().put("request",value.getString("request")).put("sequence",value.getLong("sequence")).put("detached",value.optBoolean("detached")); break; }
                    case "available": {
                        JSONObject payload = new JSONObject();
                        if (SecretStore.exists(context, SecretStore.MODEL)) payload.put("model", new JSONObject().put("model", setting(context, "model", "model", "deepseek-chat")).put("key", SecretStore.read(context, SecretStore.MODEL)));
                        String voice = setting(context, "voice", "voice", context.getSharedPreferences(SecretStore.VOICE, 0).getString("voice", ""));
                        if (SecretStore.exists(context, SecretStore.VOICE) && voice.matches("[A-Za-z0-9_-]{10,100}")) payload.put("voice", new JSONObject().put("voice", voice).put("sttModel", setting(context,"voice","sttModel","scribe_v2")).put("ttsModel",setting(context,"voice","ttsModel","eleven_multilingual_v2")).put("key",SecretStore.read(context,SecretStore.VOICE)));
                        JSONObject value = safe(payload).put("revision", ConfigCrypto.digest(payload.toString().getBytes(StandardCharsets.UTF_8)));
                        output = value; break;
                    }
                    case "seal": {
                        String text = input.getString("context"); JSONArray bound = context(text); JSONObject payload = input.getJSONObject("config");
                        if (!ConfigGrants.approved(context,bound)) throw new Exception("native approval required");
                        for (int i = 0; i < bound.getJSONArray(6).length(); i++) {
                            String scope = bound.getJSONArray(6).getString(i);
                            payload.getJSONObject(scope).put("key", ConfigGrants.key(context,bound,scope,"model".equals(scope) ? SecretStore.MODEL : SecretStore.VOICE));
                        }
                        validate(payload, bound.getJSONArray(6)); KeyPair ephemeral = ConfigCrypto.generate(); byte[] iv = new byte[12]; new SecureRandom().nextBytes(iv);
                        byte[] body = ConfigCrypto.cipher(Cipher.ENCRYPT_MODE, ephemeral.getPrivate(), bound.getString(7), text, iv).doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
                        output = new JSONObject().put("ephemeral", ConfigCrypto.encode(ephemeral.getPublic().getEncoded())).put("iv", ConfigCrypto.encode(iv)).put("body", ConfigCrypto.encode(body)); break;
                    }
                    case "apply": {
                        String text = input.getString("context"); JSONArray bound = context(text); JSONObject identity = identity(context), packet = input.getJSONObject("packet");
                        if (!identity.getString("public").equals(bound.getString(7))) throw new Exception("wrong target");
                        String encodedBody = packet.getString("body"); if (encodedBody.length() > 12000) throw new Exception("body limit");
                        String digest = ConfigCrypto.digest((text + "\n" + packet.getString("ephemeral") + "\n" + packet.getString("iv") + "\n" + encodedBody).getBytes(StandardCharsets.UTF_8)); JSONObject previous = record(context);
                        if (previous != null && previous.getString("request").equals(bound.getString(2))) {
                            if (previous.optBoolean("detached") || previous.getLong("sequence") > bound.getLong(5) || !previous.getString("source").equals(bound.getString(3))) throw new Exception("old or detached");
                            if (previous.getLong("sequence") == bound.getLong(5)) {
                                if (!previous.getString("digest").equals(digest)) throw new Exception("replay mismatch");
                                output = scoped(previous.getJSONObject("payload"), bound.getJSONArray(6)); break;
                            }
                        }
                        byte[] iv = ConfigCrypto.decode(packet.getString("iv")); if (iv.length != 12) throw new Exception("iv invalid");
                        byte[] plain = ConfigCrypto.cipher(Cipher.DECRYPT_MODE, ConfigCrypto.privateKey(identity.getString("private")), packet.getString("ephemeral"), text, iv).doFinal(ConfigCrypto.decode(encodedBody));
                        JSONObject payload = new JSONObject(new String(plain, StandardCharsets.UTF_8)); java.util.Arrays.fill(plain, (byte)0); validate(payload, bound.getJSONArray(6));
                        JSONObject storedPayload = previous == null ? new JSONObject() : new JSONObject(previous.getJSONObject("payload").toString());
                        Iterator<String> received = payload.keys(); while (received.hasNext()) { String scope = received.next(); storedPayload.put(scope,payload.getJSONObject(scope)); }
                        JSONObject value = new JSONObject().put("request", bound.getString(2)).put("source", bound.getString(3)).put("sequence", bound.getLong(5)).put("digest", digest).put("payload",storedPayload);
                        context.stopService(new android.content.Intent(context, VoiceService.class));
                        SecretStore.saveRaw(context, IMPORT, value.toString(), null); output = safe(payload); break;
                    }
                    case "detach": {
                        JSONObject value = record(context); if (value != null) { value.put("detached",true); SecretStore.saveRaw(context,IMPORT,value.toString(),null); }
                        output = true; break;
                    }
                    default: throw new Exception("unsupported operation");
                }
                return new JSONObject().put("ok",true).put("value",output).toString();
            } catch (Exception error) { return "{\"ok\":false}"; }
        }
    }
}
