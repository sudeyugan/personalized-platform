package com.yiyu.mobile;

import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class MobileBridge extends ModelBridge {
    private final MainActivity activity;
    MobileBridge(MainActivity activity, WebView web) { super(activity, web); this.activity = activity; }
    @JavascriptInterface public void showPet() { activity.runOnUiThread(activity::requestPet); }
    @JavascriptInterface public void hidePet() { activity.stopService(new Intent(activity, PetService.class)); }
    @JavascriptInterface public boolean saveApiKey(String key) {
        try { ChatBackend.saveKey(activity, key); return true; } catch (Exception error) { return false; }
    }
    @JavascriptInterface public boolean configurePet(String style, double scale, boolean motion) {
        return PetPreferences.configure(activity, style, scale, motion);
    }
}
