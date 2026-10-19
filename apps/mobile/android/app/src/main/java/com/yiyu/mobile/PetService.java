package com.yiyu.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Toast;

public class PetService extends Service {
    private WindowManager windows;
    private PetView pet;
    private PetChatPanel chat;
    private WindowManager.LayoutParams position;
    int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent != null && "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        if (pet != null) return START_NOT_STICKY;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("yiyu-pet", "桌面伙伴", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, PetService.class).setAction("stop"), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "yiyu-pet").setContentTitle("小鱼陪着你").setContentText("点击打开一隅，或随时收起桌面伙伴")
            .setSmallIcon(android.R.drawable.ic_menu_info_details).setContentIntent(open).addAction(new Notification.Action.Builder(null, "收起小鱼", stop).build()).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(18, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(18, notification);
        windows = getSystemService(WindowManager.class);
        position = new WindowManager.LayoutParams(dp(94), dp(142), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.LEFT;
        position.x = Math.max(0, getResources().getDisplayMetrics().widthPixels - dp(96));
        position.y = dp(220);
        pet = new PetView(this, this::toggleChat, this::stopSelf, (x, y, dock) -> {
            int width = getResources().getDisplayMetrics().widthPixels, height = getResources().getDisplayMetrics().heightPixels;
            position.x = Math.max(0, Math.min(width - position.width, x));
            position.y = Math.max(dp(30), Math.min(height - position.height - dp(30), y));
            if (dock) position.x = position.x + position.width / 2 < width / 2 ? 0 : width - position.width;
            try { windows.updateViewLayout(pet, position); } catch (IllegalArgumentException ignored) { }
        });
        try { windows.addView(pet, position); }
        catch (RuntimeException error) { Toast.makeText(this, "无法显示小鱼，请检查悬浮权限", Toast.LENGTH_LONG).show(); stopSelf(); }
        return START_NOT_STICKY; // No boot/autorestart or secret background resurrection.
    }
    private void toggleChat() {
        if (chat != null) { closeChat(); return; }
        chat = new PetChatPanel(this, this::closeChat);
        WindowManager.LayoutParams panel = new WindowManager.LayoutParams(Math.min(dp(320), getResources().getDisplayMetrics().widthPixels - dp(24)), dp(360), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
        panel.gravity = Gravity.CENTER;
        panel.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        try { windows.addView(chat, panel); } catch (RuntimeException error) { chat.dispose(); chat = null; }
    }
    private void closeChat() {
        if (chat == null) return;
        chat.dispose();
        try { windows.removeView(chat); } catch (IllegalArgumentException ignored) { }
        chat = null;
    }
    @Override public void onDestroy() {
        closeChat();
        if (pet != null) { pet.dispose(); try { windows.removeView(pet); } catch (IllegalArgumentException ignored) { } pet = null; }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
