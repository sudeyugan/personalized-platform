#[cfg(test)]
mod tests {
    use std::fs;

    use argon2::Argon2;
    use chacha20poly1305::{
        XChaCha20Poly1305, XNonce,
        aead::{Aead, KeyInit},
    };
    use rusqlite::Connection;
    use tempfile::tempdir;

    #[test]
    fn encrypted_vault_payload_contains_no_plaintext() {
        let plaintext = "私密标题与正文：屋檐下的晚风".as_bytes();
        let mut key = [0_u8; 32];
        Argon2::default()
            .hash_password_into(
                b"correct horse battery staple",
                b"yiyu-vault-salt",
                &mut key,
            )
            .unwrap();
        let cipher = XChaCha20Poly1305::new((&key).into());
        let nonce = XNonce::from_slice(&[7_u8; 24]);
        let ciphertext = cipher.encrypt(nonce, plaintext).unwrap();
        assert!(
            !ciphertext
                .windows(plaintext.len())
                .any(|window| window == plaintext)
        );
        assert_eq!(
            cipher.decrypt(nonce, ciphertext.as_ref()).unwrap(),
            plaintext
        );
    }

    #[test]
    fn sqlite_snapshot_survives_primary_corruption() {
        let directory = tempdir().unwrap();
        let primary = directory.path().join("primary.sqlite");
        let backup = directory.path().join("backup.sqlite");
        let connection = Connection::open(&primary).unwrap();
        connection.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE note(body TEXT); INSERT INTO note VALUES ('一致快照');").unwrap();
        connection
            .execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
            .unwrap();
        drop(connection);
        fs::write(&primary, b"damaged").unwrap();
        let restored = Connection::open(&backup).unwrap();
        let body: String = restored
            .query_row("SELECT body FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(body, "一致快照");
    }
}
