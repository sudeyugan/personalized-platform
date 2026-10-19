package com.yiyu.mobile;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;

/** Same React chat and privacy gateway as the main app; no second native chat implementation. */
final class PetChatPanel extends LinearLayout {
    private final WebView web;
    private final ModelBridge bridge;
    PetChatPanel(Context context, Runnable close) {
        super(context); setOrientation(VERTICAL);
        int pad = Math.round(12 * getResources().getDisplayMetrics().density);
        setPadding(pad, pad, pad, pad);
        boolean dark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        GradientDrawable paper = new GradientDrawable(); paper.setColor(dark ? Color.rgb(36, 41, 35) : Color.rgb(245, 241, 232)); paper.setCornerRadius(pad * 1.5f); setBackground(paper);
        LinearLayout header = new LinearLayout(context); header.setGravity(android.view.Gravity.CENTER_VERTICAL);
        TextView title = new TextView(context); title.setText("小鱼 · 在这一隅陪着你"); title.setTextColor(dark ? Color.LTGRAY : Color.DKGRAY); title.setTextSize(15);
        header.addView(title, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
        Button dismiss = new Button(context); dismiss.setText("收起"); dismiss.setOnClickListener(view -> close.run()); header.addView(dismiss); addView(header);
        web = new WebView(context); web.setBackgroundColor(Color.TRANSPARENT);
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = "https".equals(request.getUrl().getScheme()) && "appassets.androidplatform.net".equals(request.getUrl().getHost()) ? loader.shouldInterceptRequest(request.getUrl()) : null;
                return local != null ? local : new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        bridge = new ModelBridge(context, web); web.addJavascriptInterface(bridge, "YiyuMobile");
        addView(web, new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));
        web.loadUrl("https://appassets.androidplatform.net/assets/web/chat.html");
    }
    void dispose() { bridge.dispose(); web.removeJavascriptInterface("YiyuMobile"); removeView(web); web.stopLoading(); web.destroy(); }
}
