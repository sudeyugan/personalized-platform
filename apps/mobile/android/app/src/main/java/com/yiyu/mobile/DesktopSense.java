package com.yiyu.mobile;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;
import org.json.JSONObject;

/** Explicit optional consent and RAM-only layout bus, never exposed to the model bridge. */
final class DesktopSense {
    private static volatile boolean connected, desktop;
    private static volatile PetSurfaceGeometry.Surface[] surfaces = new PetSurfaceGeometry.Surface[0];
    static boolean requested(Context context) { return PetPreferences.get(context).getBoolean("desktopSense", false); }
    static boolean active(Context context) { return connected && requested(context) && enabled(context); }
    static String launcher(Context context) {
        ResolveInfo home = context.getPackageManager().resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        if (home == null || home.activityInfo == null || "android".equals(home.activityInfo.packageName)) return "";
        return home.activityInfo.packageName;
    }
    static boolean enabled(Context context) {
        AccessibilityManager manager = context.getSystemService(AccessibilityManager.class);
        ComponentName expected = new ComponentName(context, DesktopSenseService.class);
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            android.content.pm.ServiceInfo service = info.getResolveInfo().serviceInfo;
            if (expected.equals(new ComponentName(service.packageName, service.name))) return true;
        }
        return false;
    }
    static String status(Context context) {
        JSONObject value = new JSONObject();
        try { value.put("requested", requested(context)).put("enabled", enabled(context)).put("connected", connected).put("desktop", desktop).put("surfaces", surfaces.length); }
        catch (org.json.JSONException ignored) { }
        return value.toString();
    }
    static void request(MainActivity activity, boolean enable) {
        if (!enable) {
            PetPreferences.get(activity).edit().putBoolean("desktopSense", false).apply();
            DesktopSenseService.stopSensing(); publish(false, new PetSurfaceGeometry.Surface[0]);
            return;
        }
        new AlertDialog.Builder(activity).setTitle("允许小鱼感知桌面布局？")
            .setMessage("系统无障碍权限本身可以访问窗口内容，权限较强。一隅仅在你显示独立小鱼时，检查默认桌面的组件类型和矩形位置，用来坐在组件上；不读取文字、输入框、通知或截图，不点击其他应用，不保存或上传布局。\n\n接下来仍需你在系统中亲自开启。随时可在这里或系统设置关闭；桌面不提供组件边界时会回退手动停靠。")
            .setNegativeButton("暂不开启", null).setPositiveButton("前往系统授权", (dialog, which) -> {
                PetPreferences.get(activity).edit().putBoolean("desktopSense", true).apply();
                // Public system API only; OEMs differ in their private service-detail intents.
                try { activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); }
                catch (android.content.ActivityNotFoundException ignored) {
                    android.widget.Toast.makeText(activity, "请手动打开系统设置 → 无障碍 → 一隅 · 桌面停靠", android.widget.Toast.LENGTH_LONG).show();
                }
            }).show();
    }
    static void connection(boolean value) { connected = value; if (!value) publish(false, new PetSurfaceGeometry.Surface[0]); }
    static void publish(boolean home, PetSurfaceGeometry.Surface[] next) {
        desktop = home; surfaces = next;
        PetService.desktopChanged(home, next);
    }
    static void clear() { publish(false, new PetSurfaceGeometry.Surface[0]); }
}
