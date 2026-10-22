package com.yiyu.mobile;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;

final class PetView extends FrameLayout {
    interface Drag { void move(int dx, int dy, boolean finish); }
    private final WebView web;
    private final Runnable click, menu;
    private final Drag drag;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final int slop;
    private float startX, startY;
    private boolean dragging, longPressed, loaded, disposed;
    private int readinessAttempts;
    private JSONObject state;
    private final Runnable longPress = () -> { longPressed = true; performLongClick(); };
    PetView(Context context, Runnable click, Runnable menu, Drag drag) {
        super(context); this.click = click; this.menu = menu; this.drag = drag;
        slop = ViewConfiguration.get(context).getScaledTouchSlop();
        setContentDescription("小鱼，轻点开始或结束语音，拖动放置，长按打开伙伴菜单");
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES); setClickable(true); setLongClickable(true);
        web = new WebView(context); web.setBackgroundColor(Color.TRANSPARENT);
        web.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // This WebView has no native bridge and cannot load remote pages/resources.
                WebResourceResponse local = "https".equals(request.getUrl().getScheme()) && "appassets.androidplatform.net".equals(request.getUrl().getHost()) ? loader.shouldInterceptRequest(request.getUrl()) : null;
                return local != null ? local : new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public void onPageFinished(WebView view, String url) { loaded = true; publish(); }
        });
        addView(web, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        web.loadUrl("https://appassets.androidplatform.net/assets/web/pet.html");
    }
    void render(String style, String pose, boolean motion, boolean resting, boolean visible) {
        state = new JSONObject();
        try { state.put("style", style).put("pose", pose).put("motion", motion).put("resting", resting).put("visible", visible).put("phase", VoiceEvents.phase); } catch (org.json.JSONException ignored) { }
        if (visible) web.onResume();
        publish();
        if (!visible) web.onPause();
    }
    void greet() {
        if (loaded && !disposed) web.evaluateJavascript("if(typeof window.yiyuPetGreeting==='function')window.yiyuPetGreeting()", null);
    }
    private void publish() {
        if (!loaded || state == null || disposed) return;
        web.evaluateJavascript("typeof window.yiyuPetState==='function'?(window.yiyuPetState(" + state.toString() + "),true):false", ready -> {
            if (!disposed && "false".equals(ready) && isAttachedToWindow() && readinessAttempts++ < 20) handler.postDelayed(this::publish, 100);
        });
    }
    @Override public boolean onInterceptTouchEvent(MotionEvent event) { return true; }
    @Override public boolean performClick() { super.performClick(); click.run(); return true; }
    @Override public boolean performLongClick() { super.performLongClick(); menu.run(); return true; }
    @Override public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            startX = event.getRawX(); startY = event.getRawY(); dragging = false; longPressed = false;
            handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout()); return true;
        }
        int dx = Math.round(event.getRawX() - startX), dy = Math.round(event.getRawY() - startY);
        if (action == MotionEvent.ACTION_MOVE) {
            if (!dragging && Math.hypot(dx, dy) > slop) { dragging = true; handler.removeCallbacks(longPress); }
            if (dragging && !longPressed) drag.move(dx, dy, false);
            return true;
        }
        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
            handler.removeCallbacks(longPress);
            if (dragging && !longPressed) drag.move(dx, dy, true);
            else if (!longPressed && action == MotionEvent.ACTION_UP) performClick();
            return true;
        }
        return true;
    }
    void dispose() { disposed = true; handler.removeCallbacksAndMessages(null); removeView(web); web.stopLoading(); web.destroy(); }
}
