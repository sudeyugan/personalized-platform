package com.yiyu.mobile;

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.CopyOnWriteArraySet;
import org.json.JSONObject;

/** Process-local events only. No broadcasts, audio persistence, or public IPC. */
final class VoiceEvents {
    interface Listener { void changed(JSONObject event); }
    private static final CopyOnWriteArraySet<Listener> listeners = new CopyOnWriteArraySet<>();
    private static final Handler main = new Handler(Looper.getMainLooper());
    static volatile String phase = "idle", session = "", note = "";
    static void add(Listener listener) { listeners.add(listener); }
    static void remove(Listener listener) { listeners.remove(listener); }
    static JSONObject snapshot() { return event(phase, session, note, ""); }
    private static JSONObject event(String value, String id, String message, String transcript) {
        JSONObject result = new JSONObject();
        try { result.put("phase", value).put("session", id).put("note", message); if (!transcript.isEmpty()) result.put("transcript", transcript); }
        catch (org.json.JSONException ignored) { }
        return result;
    }
    static void emit(String value, String id, String message, String transcript) {
        phase = value; session = id; note = message;
        JSONObject result = event(value, id, message, transcript);
        main.post(() -> { if (!session.equals(id) || !phase.equals(value)) return; for (Listener listener : listeners) listener.changed(result); });
    }
}
