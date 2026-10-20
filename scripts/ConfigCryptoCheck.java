package com.yiyu.mobile;

import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;

/** Public test-only P-256 scalars 1/2: deliberately not production credentials. */
public final class ConfigCryptoCheck {
    public static void main(String[] args) throws Exception {
        String privateOne = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhRANCAARrF9Hy4SxCR/i85uVjpEDydwN9gS3rM6D0oTlF2JjClk/jQuL+Gn+bjufrSnwPnhYrzjNXazFezsu2QGg3v1H1";
        String publicTwo = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfPJ7GI0DT36KUjgDBLUaw8CJaeJ38hs1pgtI/EdmmXgHd1UQ247QQCk9msafdDDbun2t5jzpgimeBLedInhz0Q==";
        byte[] packet = ConfigCrypto.decode("UafH5ND0bblcAuyBwT69SDn6Glnjw6JfNQqMkm8=");
        byte[] plain = ConfigCrypto.cipher(Cipher.DECRYPT_MODE, ConfigCrypto.privateKey(privateOne), publicTwo, "bound-context", new byte[12]).doFinal(packet);
        if (!"fictional-key".equals(new String(plain, StandardCharsets.UTF_8))) throw new AssertionError("cross-platform vector");
        try { ConfigCrypto.cipher(Cipher.DECRYPT_MODE, ConfigCrypto.privateKey(privateOne), publicTwo, "other-context", new byte[12]).doFinal(packet); throw new AssertionError("accepted wrong context"); }
        catch (javax.crypto.AEADBadTagException expected) { }
        packet[0] ^= 1;
        try { ConfigCrypto.cipher(Cipher.DECRYPT_MODE, ConfigCrypto.privateKey(privateOne), publicTwo, "bound-context", new byte[12]).doFinal(packet); throw new AssertionError("accepted tamper"); }
        catch (javax.crypto.AEADBadTagException expected) { }
        java.security.KeyPair a = ConfigCrypto.generate(), b = ConfigCrypto.generate();
        byte[] body = ConfigCrypto.cipher(Cipher.ENCRYPT_MODE, a.getPrivate(), ConfigCrypto.encode(b.getPublic().getEncoded()), "test", new byte[12]).doFinal("local-test".getBytes(StandardCharsets.UTF_8));
        byte[] recovered = ConfigCrypto.cipher(Cipher.DECRYPT_MODE, b.getPrivate(), ConfigCrypto.encode(a.getPublic().getEncoded()), "test", new byte[12]).doFinal(body);
        if (!"local-test".equals(new String(recovered,StandardCharsets.UTF_8))) throw new AssertionError("round trip");
        System.out.println("Config crypto: shared vector, context, tamper and ECDH round trip passed");
    }
}
