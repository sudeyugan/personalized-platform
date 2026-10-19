package com.yiyu.mobile;

import android.animation.ValueAnimator;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Toast;

public class PetService extends Service {
    private WindowManager windows;
    private PetView pet;
    private static volatile PetService current;
    static void visibilityChanged() { PetService service = current; if (service != null && service.pet != null) service.pet.post(service::refreshVisibility); }
    private final VoiceEvents.Listener voice = event -> { if (pet != null) render(); };
    private WindowManager.LayoutParams position;
    private PetGeometry.Area area;
    private SharedPreferences preferences;
    private String pose = "right-edge";
    private boolean resting, shown = true, dragging, observing;
    private int dragX, dragY;
    private ValueAnimator docking;
    private AlertDialog menu;
    private final SharedPreferences.OnSharedPreferenceChangeListener changed = (prefs, key) -> {
        if (pet != null && ("style".equals(key) || "scale".equals(key) || "motion".equals(key))) { closeChat(); layout(); }
    };
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { refreshVisibility(); }
    };
    int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent != null && "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        if (pet != null) return START_NOT_STICKY;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("yiyu-pet", "桌面伙伴", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, PetService.class).setAction("stop"), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "yiyu-pet").setContentTitle("小鱼陪着你").setContentText("轻点开始/结束语音，拖动放置，长按调整；锁屏时休息")
            .setSmallIcon(android.R.drawable.ic_menu_info_details).setContentIntent(open).addAction(new Notification.Action.Builder(null, "收起小鱼", stop).build()).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(18, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(18, notification);
        current = this; VoiceEvents.add(voice);
        windows = getSystemService(WindowManager.class); preferences = PetPreferences.get(this);
        pose = preferences.getString("pose", "right-edge"); resting = preferences.getBoolean("resting", false);
        position = new WindowManager.LayoutParams(dp(108), dp(135), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.LEFT;
        pet = new PetView(this, this::toggleChat, this::openMenu, this::drag);
        layout();
        try { windows.addView(pet, position); }
        catch (RuntimeException error) { Toast.makeText(this, "无法显示小鱼，请检查悬浮权限", Toast.LENGTH_LONG).show(); stopSelf(); return START_NOT_STICKY; }
        preferences.registerOnSharedPreferenceChangeListener(changed);
        IntentFilter filter = new IntentFilter(); filter.addAction(Intent.ACTION_SCREEN_OFF); filter.addAction(Intent.ACTION_SCREEN_ON); filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(screen, filter);
        observing = true; refreshVisibility();
        return START_NOT_STICKY;
    }
    private PetGeometry.Area safeArea() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowMetrics metrics = windows.getCurrentWindowMetrics(); Rect bounds = metrics.getBounds();
            android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            return new PetGeometry.Area(insets.left, insets.top, bounds.width() - insets.right, bounds.height() - insets.bottom);
        }
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics(); windows.getDefaultDisplay().getRealMetrics(metrics);
        WindowInsets legacy = pet == null ? null : pet.getRootWindowInsets();
        if (legacy != null) return new PetGeometry.Area(legacy.getStableInsetLeft(), legacy.getStableInsetTop(), metrics.widthPixels - legacy.getStableInsetRight(), metrics.heightPixels - legacy.getStableInsetBottom());
        return new PetGeometry.Area(dp(8), dp(28), metrics.widthPixels - dp(8), metrics.heightPixels - dp(48));
    }
    private void layout() {
        if (docking != null) docking.cancel();
        area = safeArea();
        String mode = preferences.getString("style", "figurine");
        int base = "mark".equals(mode) ? 44 : "expanded".equals(mode) ? 112 : 56;
        int width = Math.max(1, Math.min(dp(base * preferences.getFloat("scale", 1)), Math.min(area.width(), Math.round(area.height() * .32f * .8f))));
        position.width = width; position.height = Math.max(1, Math.min(area.height(), Math.round(width * 1.25f)));
        PetGeometry.Placement restored = PetGeometry.restore(area, position.width, position.height, preferences.getFloat("nx", 1), preferences.getFloat("ny", .4f), pose);
        position.x = restored.x; position.y = restored.y; dragging = false; updateWindow(); render();
    }
    private void render() { if (pet != null) pet.render(preferences.getString("style", "figurine"), pose, preferences.getBoolean("motion", true), resting, shown); }
    private void updateWindow() { if (pet != null && pet.isAttachedToWindow()) { try { windows.updateViewLayout(pet, position); } catch (IllegalArgumentException ignored) { } } }
    private void persistPosition() { PetPreferences.position(this, area, position.width, position.height, position.x, position.y, pose); }
    private void drag(int dx, int dy, boolean finish) {
        if (!dragging) { if (docking != null) docking.cancel(); dragX = position.x; dragY = position.y; dragging = true; closeChat(); }
        PetGeometry.Placement next = PetGeometry.place(area, position.width, position.height, dragX + dx, dragY + dy, finish, dp(30));
        if (!finish) { position.x = next.x; position.y = next.y; updateWindow(); return; }
        dragging = false; pose = next.pose; render();
        final int fromX = position.x, fromY = position.y;
        if (!preferences.getBoolean("motion", true)) { position.x = next.x; position.y = next.y; updateWindow(); persistPosition(); return; }
        docking = ValueAnimator.ofFloat(0, 1); docking.setDuration(230); docking.setInterpolator(new android.view.animation.DecelerateInterpolator());
        docking.addUpdateListener(animation -> { float progress = (float) animation.getAnimatedValue(); position.x = fromX + Math.round((next.x - fromX) * progress); position.y = fromY + Math.round((next.y - fromY) * progress); updateWindow(); });
        docking.addListener(new android.animation.AnimatorListenerAdapter() { @Override public void onAnimationEnd(android.animation.Animator animation) { persistPosition(); } }); docking.start();
    }
    private void setPose(String next) {
        if (docking != null) docking.cancel();
        pose = next;
        if ("left-edge".equals(next)) position.x = area.left;
        if ("right-edge".equals(next)) position.x = area.right - position.width;
        if ("bottom-edge".equals(next)) position.y = area.bottom - position.height;
        persistPosition(); updateWindow(); render();
    }
    private void refreshVisibility() {
        shown = !MainActivity.foreground && getSystemService(PowerManager.class).isInteractive() && !getSystemService(KeyguardManager.class).isKeyguardLocked();
        if (!shown) { closeChat(); if (menu != null) menu.dismiss(); }
        if (pet != null) { pet.setVisibility(shown ? View.VISIBLE : View.GONE); render(); }
    }
    private void openMenu() {
        if (!shown || pet == null) return;
        String[] actions = { VoiceService.running() ? "结束语音" : "和小鱼说话", "自由放置", "靠左边", "靠右边", "放在底部", resting ? "醒一醒" : "歇一会儿", "打开一隅", "收起小鱼" };
        menu = new AlertDialog.Builder(new android.view.ContextThemeWrapper(this, android.R.style.Theme_Material_Light_Dialog_Alert)).setTitle("小鱼 · 留在你喜欢的位置").setItems(actions, (dialog, which) -> {
            if (which == 0) toggleChat();
            else if (which <= 4) setPose(new String[]{"", "float", "left-edge", "right-edge", "bottom-edge"}[which]);
            else if (which == 5) { resting = !resting; if (resting) stopService(new Intent(this, VoiceService.class)); preferences.edit().putBoolean("resting", resting).apply(); render(); }
            else if (which == 6) startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            else stopSelf();
        }).create();
        if (menu.getWindow() != null) menu.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        try { menu.show(); } catch (RuntimeException ignored) { menu = null; }
    }
    private void toggleChat() {
        if (!shown) return;
        if (VoiceService.running()) { stopService(new Intent(this, VoiceService.class)); return; }
        resting = false; preferences.edit().putBoolean("resting", false).apply();
        startActivity(MainActivity.voiceIntent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }
    private void closeChat() { /* Voice-first: no overlay text panel or second repository writer. */ }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); closeChat(); if (menu != null) menu.dismiss(); if (pet != null) layout(); }
    @Override public void onDestroy() {
        if (current == this) current = null;
        VoiceEvents.remove(voice); stopService(new Intent(this, VoiceService.class));
        if (observing) unregisterReceiver(screen);
        if (preferences != null) preferences.unregisterOnSharedPreferenceChangeListener(changed);
        if (docking != null) docking.cancel(); if (menu != null) menu.dismiss(); closeChat();
        if (pet != null) { pet.dispose(); try { windows.removeView(pet); } catch (IllegalArgumentException ignored) { } pet = null; }
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
