package com.yiyu.mobile;

import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class MobileBridge extends ModelBridge {
    private final MainActivity activity;
    private final WebView web;
    private volatile boolean closed;
    private final VoiceEvents.Listener voice = event -> publishVoice(event);
    MobileBridge(MainActivity activity, WebView web) { super(activity, web); this.activity = activity; this.web = web; VoiceEvents.add(voice); }
    private void publishVoice(org.json.JSONObject event) { web.post(() -> { if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('yiyu-voice',{detail:" + event.toString() + "}))", null); }); }
    @JavascriptInterface public void voiceReady() { activity.runOnUiThread(() -> { publishVoice(VoiceEvents.snapshot()); activity.voiceReady(); }); }
    @JavascriptInterface public void startVoice() { activity.runOnUiThread(activity::requestVoice); }
    @JavascriptInterface public void stopVoice() { activity.stopService(new Intent(activity, VoiceService.class)); }
    @JavascriptInterface public void voiceReply(String id, String text) { VoiceService.reply(id, text); }
    @JavascriptInterface public void voiceReject(String id) { VoiceService.reject(id, "这轮需要处理或隐私确认，已停止采集。请在一隅中查看。" ); }
    @JavascriptInterface public boolean voiceConfigured() { return VoiceBackend.configured(activity); }
    @JavascriptInterface public boolean saveVoiceConfig(String key, String voiceId) {
        if (voiceId == null || !voiceId.matches("[A-Za-z0-9_-]{10,100}")) return false;
        try { activity.stopService(new Intent(activity, VoiceService.class)); String value = key == null || key.isEmpty() ? SecretStore.read(activity, SecretStore.VOICE) : key; SecretStore.save(activity, SecretStore.VOICE, value, voiceId); return true; }
        catch (Exception error) { return false; }
    }
    @JavascriptInterface public boolean clearVoiceConfig() { try { activity.stopService(new Intent(activity, VoiceService.class)); SecretStore.save(activity, SecretStore.VOICE, ""); return true; } catch (Exception error) { return false; } }
    @Override void dispose() { closed = true; VoiceEvents.remove(voice); super.dispose(); }
    @JavascriptInterface public void showPet() { activity.runOnUiThread(activity::requestPet); }
    @JavascriptInterface public void hidePet() { activity.stopService(new Intent(activity, PetService.class)); activity.stopService(new Intent(activity, VoiceService.class)); }
    @JavascriptInterface public boolean saveApiKey(String key) {
        try { ChatBackend.saveKey(activity, key); return true; } catch (Exception error) { return false; }
    }
    @JavascriptInterface public boolean configurePet(String style, double scale, boolean motion) {
        return PetPreferences.configure(activity, style, scale, motion);
    }
}
