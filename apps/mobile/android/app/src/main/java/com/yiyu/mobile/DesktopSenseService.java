package com.yiyu.mobile;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/** Only launcher geometry crosses this boundary. No text, screenshots, gestures or network. */
public final class DesktopSenseService extends AccessibilityService {
    private static DesktopSenseService current;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String home = "";
    private boolean scheduled, stopped;
    private long lastScan;
    private final Runnable scan = () -> { scheduled = false; observe(); };
    private final SharedPreferences.OnSharedPreferenceChangeListener preference = (prefs, key) -> {
        if ("desktopSense".equals(key) && !DesktopSense.requested(this)) { handler.removeCallbacks(scan); scheduled = false; DesktopSense.clear(); }
    };
    static void refresh() {
        DesktopSenseService service = current;
        if (service != null) service.handler.post(service::schedule);
    }
    static void stopSensing() {
        DesktopSenseService service = current;
        if (service != null) service.handler.post(() -> { service.handler.removeCallbacksAndMessages(null); service.disableSelf(); });
    }
    @Override protected void onServiceConnected() {
        current = this; home = DesktopSense.launcher(this);
        PetPreferences.get(this).registerOnSharedPreferenceChangeListener(preference);
        DesktopSense.connection(true); schedule();
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!allowed()) { DesktopSense.clear(); return; }
        CharSequence source = event.getPackageName();
        // Non-launcher events are used only as a leave signal: no event text/source is retrieved.
        if (source == null || !home.contentEquals(source)) {
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                handler.removeCallbacks(scan); scheduled = false; DesktopSense.clear();
            }
            return;
        }
        if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_SCROLLED) DesktopSense.clear();
        schedule();
    }
    private boolean allowed() {
        return DesktopSense.requested(this) && PetService.visibleForSensing()
            && getSystemService(PowerManager.class).isInteractive()
            && !getSystemService(KeyguardManager.class).isKeyguardLocked();
    }
    private void schedule() {
        if (scheduled || !allowed()) return;
        scheduled = true;
        handler.postDelayed(scan, Math.max(140, 650 - (android.os.SystemClock.elapsedRealtime() - lastScan)));
    }
    private void observe() {
        if (!allowed()) { DesktopSense.clear(); return; }
        lastScan = android.os.SystemClock.elapsedRealtime();
        home = DesktopSense.launcher(this);
        if (home.isEmpty()) { DesktopSense.clear(); return; }
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) { DesktopSense.clear(); return; }
            // Only inspect ownership before handing the root to the narrow layout-only walker.
            if (root.getPackageName() == null || !home.contentEquals(root.getPackageName())) { root.recycle(); DesktopSense.clear(); return; }
            DesktopSense.publish(true, DesktopLayout.scan(new LayoutNode(root), home, getResources().getDisplayMetrics().density));
        } catch (IllegalStateException | SecurityException ignored) { DesktopSense.clear(); }
    }
    private static final class LayoutNode implements DesktopLayout.Node {
        private final AccessibilityNodeInfo node;
        LayoutNode(AccessibilityNodeInfo node) { this.node = node; }
        public String owner() { CharSequence value = node.getPackageName(); return value == null ? "" : value.toString(); }
        public String type() { CharSequence value = node.getClassName(); return value == null ? "" : value.toString(); }
        public boolean visible() { return node.isVisibleToUser(); }
        public PetSurfaceGeometry.Surface bounds() {
            android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
            return new PetSurfaceGeometry.Surface(bounds.left, bounds.top, bounds.right, bounds.bottom);
        }
        public int children() { return node.getChildCount(); }
        public DesktopLayout.Node child(int index) { AccessibilityNodeInfo child = node.getChild(index); return child == null ? null : new LayoutNode(child); }
        public void close() { node.recycle(); }
    }
    @Override public void onInterrupt() { handler.removeCallbacksAndMessages(null); scheduled = false; DesktopSense.clear(); }
    @Override public boolean onUnbind(Intent intent) { shutdown(); return super.onUnbind(intent); }
    private void shutdown() {
        if (stopped) return;
        stopped = true;
        if (current == this) current = null;
        handler.removeCallbacksAndMessages(null); scheduled = false;
        PetPreferences.get(this).unregisterOnSharedPreferenceChangeListener(preference);
        DesktopSense.connection(false);
    }
    @Override public void onDestroy() { shutdown(); super.onDestroy(); }
}
