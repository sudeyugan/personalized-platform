package com.yiyu.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

final class ChatBackend {
    private static final String ALIAS = "yiyu-mobile-api-v1";
    private static SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    static void saveKey(Context context, String key) throws Exception {
        if (key.length() > 500 || key.contains("\n") || key.contains("\r")) throw new Exception("invalid key");
        if (key.isEmpty()) {
            if (!context.getSharedPreferences(ALIAS, 0).edit().clear().commit()) throw new Exception("delete failed");
            return;
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        String body = Base64.encodeToString(cipher.doFinal(key.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!context.getSharedPreferences(ALIAS, 0).edit().putString("iv", iv).putString("body", body).commit()) throw new Exception("save failed");
    }
    private static String key(Context context) throws Exception {
        android.content.SharedPreferences prefs = context.getSharedPreferences(ALIAS, 0);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(prefs.getString("body", ""), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    static String reply(Context context, String prompt) throws Exception {
        return reply(context, prompt, false);
    }
    static String reply(Context context, String prompt, boolean idea) throws Exception {
        return reply(context, prompt, idea, false);
    }
    static String reply(Context context, String prompt, boolean idea, boolean contextChat) throws Exception {
        if (prompt.trim().isEmpty() || prompt.length() > (idea || contextChat ? 20000 : 3000)) throw new Exception("invalid prompt");
        JSONArray messages = new JSONArray().put(new JSONObject().put("role", "system").put("content", idea ? "你是一隅想法工坊的思考伙伴。只处理用户本份想法，遵循给出的JSON结构；没有任何工具，不读取其他资料，不声称执行操作。" : "你是一隅的手机伙伴小鱼。温和简洁地回应，结合本会话上下文。你没有访问电脑、浏览器或手机资料的工具；不要编造已经执行的操作。"));
        if (contextChat) {
            JSONArray history = new JSONArray(prompt);
            if (history.length() < 1 || history.length() > 9) throw new Exception("invalid history");
            for (int index = 0; index < history.length(); index++) {
                JSONObject item = history.getJSONObject(index);
                String role = item.getString("role"), text = item.getString("content");
                if (!("user".equals(role) || "assistant".equals(role)) || text.trim().isEmpty() || text.length() > 12000) throw new Exception("invalid message");
                messages.put(new JSONObject().put("role", role).put("content", text));
            }
            if (!"user".equals(history.getJSONObject(history.length() - 1).getString("role"))) throw new Exception("invalid last role");
        } else messages.put(new JSONObject().put("role", "user").put("content", prompt));
        HttpsURLConnection connection = (HttpsURLConnection) new URL("https://api.deepseek.com/chat/completions").openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("POST"); connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + key(context));
        connection.setRequestProperty("Content-Type", "application/json");
        byte[] request = new JSONObject().put("model", "deepseek-chat").put("stream", false).put("max_tokens", idea ? 2400 : 1000).put("messages", messages).toString().getBytes(StandardCharsets.UTF_8);
        try {
            try (java.io.OutputStream out = connection.getOutputStream()) { out.write(request); }
            if (connection.getResponseCode() != 200) throw new Exception("provider unavailable");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] chunk = new byte[4096]; int count;
                while ((count = input.read(chunk)) != -1) { if (buffer.size() + count > 200000) throw new Exception("response too large"); buffer.write(chunk, 0, count); }
            }
            return new JSONObject(buffer.toString("UTF-8")).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content");
        } finally { connection.disconnect(); }
    }
}
