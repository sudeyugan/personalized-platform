package com.yiyu.mobile;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The overlay receives only model messaging, never key management or pet permissions. */
public class ModelBridge {
    private final Context context;
    private final WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean busy = new java.util.concurrent.atomic.AtomicBoolean(false);
    private volatile boolean disposed;
    ModelBridge(Context context, WebView web) { this.context = context; this.web = web; }
    @JavascriptInterface public void chat(String id, String prompt) { request(id, prompt, false); }
    @JavascriptInterface public void ideaRound(String id, String material) { request(id, material, true); }
    @JavascriptInterface public void chatWithContext(String id, String material) { request(id, material, false, true); }
    private void deliver(String id, String content, boolean success) {
        JSONObject result = new JSONObject();
        try { result.put("id", id).put("content", content).put("success", success); } catch (org.json.JSONException ignored) { return; }
        web.post(() -> { if (!disposed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('yiyu-chat-result',{detail:" + result.toString() + "}))", null); });
    }
    private void request(String id, String prompt, boolean idea) {
        request(id, prompt, idea, false);
    }
    private void request(String id, String prompt, boolean idea, boolean contextChat) {
        if (disposed || id == null || !id.matches("[a-f0-9-]{36}")) return;
        if (prompt == null || prompt.trim().isEmpty() || prompt.length() > (idea || contextChat ? 20000 : 3000)) { deliver(id, "这段文字过长或为空，没有发送。", false); return; }
        if (!busy.compareAndSet(false, true)) { deliver(id, "上一条模型请求还在结束，请稍后再发；本次没有发送。", false); return; }
        try { worker.execute(() -> {
            try { deliver(id, ChatBackend.reply(context, prompt, idea, contextChat), true); }
            catch (Exception error) { deliver(id, "暂时没有接通。请检查手机单独配置的模型密钥与网络；没有取得可用回复，已保存的对话仍保留。", false); }
            finally { busy.set(false); }
        }); } catch (java.util.concurrent.RejectedExecutionException ignored) { busy.set(false); deliver(id, "对话已经关闭，本次没有发送。", false); }
    }
    void dispose() { disposed = true; worker.shutdownNow(); }
}
