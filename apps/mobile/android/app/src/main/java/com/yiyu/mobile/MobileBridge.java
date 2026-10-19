package com.yiyu.mobile;

import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MobileBridge {
    private final MainActivity activity;
    private final WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean busy = new java.util.concurrent.atomic.AtomicBoolean(false);
    MobileBridge(MainActivity activity, WebView web) { this.activity = activity; this.web = web; }
    @JavascriptInterface public void showPet() { activity.runOnUiThread(activity::requestPet); }
    @JavascriptInterface public void hidePet() { activity.stopService(new Intent(activity, PetService.class)); }
    @JavascriptInterface public boolean saveApiKey(String key) {
        try { ChatBackend.saveKey(activity, key); return true; } catch (Exception error) { return false; }
    }
    @JavascriptInterface public void chat(String id, String prompt) {
        if (!id.matches("[a-f0-9-]{36}") || prompt.length() > 3000 || !busy.compareAndSet(false, true)) return;
        worker.execute(() -> {
            String content;
            boolean success;
            try { content = ChatBackend.reply(activity, prompt); success = true; }
            catch (Exception error) { content = "暂时没有接通。请检查手机单独配置的模型密钥与网络；本次文字没有保存到中枢。"; success = false; }
            JSONObject result = new JSONObject();
            try { result.put("id", id); result.put("content", content); result.put("success", success); } catch (Exception ignored) { return; }
            busy.set(false);
            activity.runOnUiThread(() -> {
                if (!activity.isDestroyed()) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('yiyu-chat-result',{detail:" + result.toString() + "}))", null);
            });
        });
    }
    void dispose() { worker.shutdownNow(); }
}
