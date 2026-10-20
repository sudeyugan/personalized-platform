package com.yiyu.mobile;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

final class ChatBackend {
    static void saveKey(Context context, String key) throws Exception {
        SecretStore.save(context, SecretStore.MODEL, key);
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
        connection.setRequestProperty("Authorization", "Bearer " + SecretStore.read(context, SecretStore.MODEL));
        connection.setRequestProperty("Content-Type", "application/json");
        byte[] request = new JSONObject().put("model", ConfigHandoff.setting(context, "model", "model", "deepseek-chat")).put("stream", false).put("max_tokens", idea ? 2400 : 1000).put("messages", messages).toString().getBytes(StandardCharsets.UTF_8);
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
