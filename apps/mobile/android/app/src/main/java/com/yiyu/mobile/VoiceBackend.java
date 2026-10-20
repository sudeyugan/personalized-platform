package com.yiyu.mobile;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** The only audio destinations are the existing ElevenLabs fixed APIs. */
final class VoiceBackend {
    private volatile HttpsURLConnection connection;
    private volatile boolean cancelled;
    void cancel() { cancelled = true; HttpsURLConnection current = connection; if (current != null) current.disconnect(); }
    static boolean configured(Context context) {
        return SecretStore.exists(context, SecretStore.VOICE) && voice(context).matches("[A-Za-z0-9_-]{10,100}");
    }
    private static String voice(Context context) { return ConfigHandoff.setting(context,"voice","voice",context.getSharedPreferences(SecretStore.VOICE,0).getString("voice","")); }
    private byte[] request(Context context, String path, String type, byte[] body, int limit) throws Exception {
        if (cancelled) throw new Exception("voice cancelled");
        HttpsURLConnection request = (HttpsURLConnection) new URL("https://api.elevenlabs.io/v1/" + path).openConnection();
        connection = request;
        request.setConnectTimeout(12000); request.setReadTimeout(30000); request.setInstanceFollowRedirects(false);
        request.setRequestMethod("POST"); request.setDoOutput(true); request.setFixedLengthStreamingMode(body.length);
        request.setRequestProperty("xi-api-key", SecretStore.read(context, SecretStore.VOICE)); request.setRequestProperty("Content-Type", type);
        try {
            if (cancelled) throw new Exception("voice cancelled");
            try (java.io.OutputStream out = request.getOutputStream()) { if (cancelled) throw new Exception("voice cancelled"); out.write(body); }
            if (request.getResponseCode() != 200) throw new Exception("voice unavailable");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (java.io.InputStream in = request.getInputStream()) { byte[] chunk = new byte[4096]; int count; while ((count = in.read(chunk)) != -1) { if (bytes.size() + count > limit) throw new Exception("voice response too large"); bytes.write(chunk, 0, count); } }
            return bytes.toByteArray();
        } finally { request.disconnect(); if (connection == request) connection = null; }
    }
    String transcribe(Context context, byte[] wav) throws Exception {
        if (wav.length > 1_000_000) throw new Exception("utterance too long");
        String boundary = "yiyu-" + java.util.UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\n" + ConfigHandoff.setting(context,"voice","sttModel","scribe_v2") + "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"utterance.wav\"\r\nContent-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(wav); body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        String text = new JSONObject(new String(request(context, "speech-to-text", "multipart/form-data; boundary=" + boundary, body.toByteArray(), 100000), StandardCharsets.UTF_8)).optString("text", "").trim();
        if (text.length() > 3000) throw new Exception("transcript too long");
        return text;
    }
    byte[] speak(Context context, String text) throws Exception {
        if (text.isEmpty() || text.length() > 4000) throw new Exception("speech too long");
        String voice = voice(context);
        if (!voice.matches("[A-Za-z0-9_-]{10,100}")) throw new Exception("voice not configured");
        byte[] body = new JSONObject().put("text", text).put("model_id", ConfigHandoff.setting(context,"voice","ttsModel","eleven_multilingual_v2")).toString().getBytes(StandardCharsets.UTF_8);
        return request(context, "text-to-speech/" + voice + "?output_format=mp3_44100_128", "application/json", body, 8_000_000);
    }
}
