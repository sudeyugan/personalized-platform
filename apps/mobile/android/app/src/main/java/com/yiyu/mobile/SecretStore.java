package com.yiyu.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Fixed native aliases only; there is intentionally no JavaScript read/export API. */
final class SecretStore {
    static final String MODEL = "yiyu-mobile-api-v1", VOICE = "yiyu-mobile-voice-v1";
    private static SecretKey key(String alias) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    static void save(Context context, String alias, String value) throws Exception {
        save(context, alias, value, null);
    }
    static void save(Context context, String alias, String value, String voice) throws Exception {
        if (value == null || value.length() > 500 || value.contains("\n") || value.contains("\r")) throw new Exception("invalid key");
        android.content.SharedPreferences preferences = context.getSharedPreferences(alias, 0);
        if (value.isEmpty()) { if (!preferences.edit().clear().commit()) throw new Exception("delete failed"); return; }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(alias));
        android.content.SharedPreferences.Editor editor = preferences.edit().putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString("body", Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        if (voice != null && VOICE.equals(alias)) editor.putString("voice", voice);
        if (!editor.commit()) throw new Exception("save failed");
    }
    static String read(Context context, String alias) throws Exception {
        android.content.SharedPreferences preferences = context.getSharedPreferences(alias, 0);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(alias), new GCMParameterSpec(128, Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(preferences.getString("body", ""), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    static boolean exists(Context context, String alias) { return context.getSharedPreferences(alias, 0).contains("body"); }
}
