package com.yiyu.mobile;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Portable JCA primitives, also exercised on the host JVM with Rust-compatible vectors. */
final class ConfigCrypto {
    static KeyPair generate() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }
    static PrivateKey privateKey(String encoded) throws Exception {
        return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(decode(encoded)));
    }
    static byte[] decode(String value) { return Base64.getDecoder().decode(value); }
    static String encode(byte[] value) { return Base64.getEncoder().encodeToString(value); }
    static String digest(byte[] value) throws Exception { return encode(MessageDigest.getInstance("SHA-256").digest(value)); }
    static Cipher cipher(int mode, PrivateKey local, String publicKey, String context, byte[] iv) throws Exception {
        PublicKey peer = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(decode(publicKey)));
        if (!(peer instanceof java.security.interfaces.ECPublicKey) || !((java.security.interfaces.ECPublicKey) peer).getParams().getOrder().equals(
            ((java.security.interfaces.ECPrivateKey) local).getParams().getOrder())) throw new Exception("wrong curve");
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH"); agreement.init(local); agreement.doPhase(peer, true);
        byte[] shared = agreement.generateSecret();
        // HKDF extract salt=SHA256(AAD), then expand one SHA256 block.
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(context.getBytes(StandardCharsets.UTF_8)), "HmacSHA256"));
        byte[] prk = mac.doFinal(shared);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update("yiyu-config-v1".getBytes(StandardCharsets.UTF_8));
        byte[] key = mac.doFinal(new byte[]{1});
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
        Arrays.fill(shared, (byte)0); Arrays.fill(prk, (byte)0); Arrays.fill(key, (byte)0);
        return cipher;
    }
}
