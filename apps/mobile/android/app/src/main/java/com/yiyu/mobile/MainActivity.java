package com.yiyu.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    static final String START_VOICE = "com.yiyu.mobile.START_VOICE";
    private static final VoiceLaunchGate voiceLaunch = new VoiceLaunchGate();
    static Intent voiceIntent(android.content.Context context) { return new Intent(context, MainActivity.class).setAction(START_VOICE).putExtra("voiceConsent", voiceLaunch.issue(android.os.SystemClock.elapsedRealtime())).putExtra("voiceReturn", !foreground); }
    private boolean consumeVoiceIntent(Intent intent) {
        if (!START_VOICE.equals(intent.getAction())) return false;
        intent.setAction(null);
        boolean accepted = voiceLaunch.consume(intent.getStringExtra("voiceConsent"), android.os.SystemClock.elapsedRealtime());
        // Only an authenticated, explicit gesture may set this navigation hint.
        if (accepted) voiceReturn = intent.getBooleanExtra("voiceReturn", true);
        return accepted;
    }
    private boolean voiceClientReady, pendingVoice, voiceReturn, resumed, startWhenResumed;
    static volatile boolean foreground;
    private WebView web;
    private FrameLayout surface;
    private MobileBridge bridge;
    private boolean awaitingOverlay = false;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        surface = new FrameLayout(this);
        surface.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        surface.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(android.view.WindowInsets.Type.ime());
                // Resize the WebView's actual viewport, not padding inside its web page.
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return android.view.WindowInsets.CONSUMED;
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = loader.shouldInterceptRequest(request.getUrl());
                if (local == null && "appassets.androidplatform.net".equals(request.getUrl().getHost())) return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
                return local;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The privileged native bridge must never be exposed to a remote page.
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(request.getUrl().getScheme()) && !"appassets.androidplatform.net".equals(request.getUrl().getHost()) && request.getUrl().getUserInfo() == null) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (android.content.ActivityNotFoundException ignored) { }
                    return true;
                }
                return !"https".equals(request.getUrl().getScheme()) || !"appassets.androidplatform.net".equals(request.getUrl().getHost()) || !"/assets/web/index.html".equals(request.getUrl().getPath());
            }
        });
        bridge = new MobileBridge(this, web);
        web.addJavascriptInterface(bridge, "YiyuMobile");
        setContentView(surface);
        applyAppearance();
        surface.requestApplyInsets();
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html");
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }
    private void applyAppearance() {
        boolean dark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int paper = android.graphics.Color.parseColor(dark ? "#242923" : "#f5f1e8");
        if (surface != null) surface.setBackgroundColor(paper);
        if (web != null) web.setBackgroundColor(paper);
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController() != null) {
            int light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : light, light);
        }
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(paper);
            getWindow().setNavigationBarColor(paper);
        }
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration config) {
        super.onConfigurationChanged(config);
        applyAppearance();
        if (surface != null) surface.requestApplyInsets();
    }
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("!window.dispatchEvent(new Event('yiyu-back',{cancelable:true}))", handled -> { if (!"true".equals(handled)) finish(); });
    }
    void voiceReady() {
        voiceClientReady = true;
        if (consumeVoiceIntent(getIntent())) requestVoice();
    }
    void requestVoice() {
        if (!voiceClientReady || isFinishing()) return;
        if (!resumed) { startWhenResumed = true; return; }
        startWhenResumed = false;
        if (!VoiceBackend.configured(this)) { voiceReturn = false; VoiceEvents.emit("error", "", "请在手机连接与设置中配置ElevenLabs密钥和声音。", ""); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingVoice = true; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 201); return;
        }
        try {
            startForegroundService(new Intent(this, VoiceService.class));
            if (voiceReturn) { voiceReturn = false; web.postDelayed(() -> { if (!isFinishing()) moveTaskToBack(true); }, 250); }
        } catch (RuntimeException error) { voiceReturn = false; VoiceEvents.emit("error", "", "系统未允许开始语音，请在一隅内重新开启。", ""); }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (voiceClientReady && consumeVoiceIntent(intent)) web.post(this::requestVoice);
    }
    @Override public void onBackPressed() { handleBack(); }
    void requestPet() {
        if (!Settings.canDrawOverlays(this)) {
            awaitingOverlay = true;
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            awaitingOverlay = true;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
            return;
        }
        startForegroundService(new Intent(this, PetService.class));
    }
    @Override protected void onResume() {
        super.onResume();
        resumed = true; foreground = true; PetService.visibilityChanged();
        if (startWhenResumed) web.post(this::requestVoice);
        if (awaitingOverlay && Settings.canDrawOverlays(this)) { awaitingOverlay = false; requestPet(); }
    }
    @Override protected void onPause() { resumed = false; foreground = false; PetService.visibilityChanged(); super.onPause(); }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == 201) {
            boolean allowed = pendingVoice && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED;
            pendingVoice = false;
            if (allowed) requestVoice(); else { voiceReturn = false; VoiceEvents.emit("error", "", "没有麦克风授权，未开始采集。", ""); }
            return;
        }
        awaitingOverlay = false;
        if (request == 100 && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED && Settings.canDrawOverlays(this)) startForegroundService(new Intent(this, PetService.class));
    }
    @Override protected void onDestroy() {
        stopService(new Intent(this, VoiceService.class));
        if (bridge != null) bridge.dispose();
        if (web != null) { web.removeJavascriptInterface("YiyuMobile"); web.destroy(); }
        super.onDestroy();
    }
}
