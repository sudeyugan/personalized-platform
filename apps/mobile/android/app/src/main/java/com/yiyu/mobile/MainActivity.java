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
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private WebView web;
    private MobileBridge bridge;
    private boolean awaitingOverlay = false;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
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
                return !"https".equals(request.getUrl().getScheme()) || !"appassets.androidplatform.net".equals(request.getUrl().getHost()) || !"/assets/web/index.html".equals(request.getUrl().getPath());
            }
        });
        bridge = new MobileBridge(this, web);
        web.addJavascriptInterface(bridge, "YiyuMobile");
        setContentView(web);
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html");
    }
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
        if (awaitingOverlay && Settings.canDrawOverlays(this)) { awaitingOverlay = false; requestPet(); }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        awaitingOverlay = false;
        if (request == 100 && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED && Settings.canDrawOverlays(this)) startForegroundService(new Intent(this, PetService.class));
    }
    @Override protected void onDestroy() {
        if (bridge != null) bridge.dispose();
        if (web != null) { web.removeJavascriptInterface("YiyuMobile"); web.destroy(); }
        super.onDestroy();
    }
}
