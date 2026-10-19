package com.yiyu.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started bounded voice session. PCM/MP3 stay in RAM, never backups or the hub. */
public final class VoiceService extends Service {
    static final String STOP = "com.yiyu.mobile.STOP_VOICE";
    private static volatile VoiceService current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final VoiceRecorder microphone = new VoiceRecorder();
    private final VoiceBackend backend = new VoiceBackend();
    private volatile boolean active;
    private String session;
    private MediaPlayer player;
    private MemoryAudio playback;
    private AudioFocusRequest focus;
    private long turn;
    private boolean answering;
    private boolean observing;
    private final BroadcastReceiver screen = new BroadcastReceiver() { @Override public void onReceive(Context context, Intent intent) { end("锁屏后已结束语音。", false); } };
    static boolean running() { VoiceService service = current; return service != null && service.active; }
    static void reply(String id, String text) {
        VoiceService service = current;
        if (service != null) service.main.post(() -> service.answer(id, text));
    }
    static void reject(String id, String note) {
        VoiceService service = current;
        if (service != null) service.main.post(() -> { if (service.valid(id)) service.end(note, true); });
    }
    private boolean valid(String id) { return active && session != null && session.equals(id); }
    @Override public void onCreate() { super.onCreate(); current = this; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) { end("语音已结束。", false); return START_NOT_STICKY; }
        if (active) return START_NOT_STICKY;
        session = java.util.UUID.randomUUID().toString();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED || !VoiceBackend.configured(this)) { end("请先授权麦克风并配置手机的ElevenLabs密钥与声音。", true); return START_NOT_STICKY; }
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel("yiyu-voice", "小鱼语音会话", NotificationManager.IMPORTANCE_LOW));
            PendingIntent stop = PendingIntent.getService(this, 17, new Intent(this, VoiceService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(this, "yiyu-voice").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("小鱼 · 语音会话")
                .setContentText("音频用于ElevenLabs识别；轻点结束。锁屏后停止。").setOngoing(true).setContentIntent(stop).addAction(new Notification.Action.Builder(null, "结束语音", stop).build()).build();
            if (Build.VERSION.SDK_INT >= 30) startForeground(19, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE); else startForeground(19, notification);
            active = true;
            AudioManager audioManager = getSystemService(AudioManager.class);
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener(change -> { if (active && change < 0) end("通话或其他音频接管后，语音已停止。", false); }, main).build();
            if (audioManager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { end("当前音频被占用，未开始采集。", true); return START_NOT_STICKY; }
            IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(screen, filter);
            observing = true;
            main.postDelayed(() -> { if (active) end("本次语音已达十分钟，请需要时重新开启。", false); }, 600_000);
            listen();
        } catch (RuntimeException error) { end("系统未允许启动后台语音，请在一隅内重新开启。", true); }
        return START_NOT_STICKY;
    }
    private void listen() {
        if (!active) return;
        answering = false;
        final long round = ++turn;
        final String id = session;
        VoiceEvents.emit("thinking", id, "正在准备麦克风。", "");
        worker.execute(() -> {
            try {
                byte[] audio = microphone.capture(this, () -> valid(id), () -> publish(id, "listening", ""));
                if (!valid(id)) return;
                if (audio == null) { main.post(() -> { if (valid(id)) end("安静了一分钟，语音已自动结束。", false); }); return; }
                if (audio.length == 0) { main.post(() -> { if (valid(id)) listen(); }); return; }
                publish(id, "thinking", "");
                String transcript;
                try { transcript = backend.transcribe(this, audio); } finally { java.util.Arrays.fill(audio, (byte)0); }
                if (!valid(id)) return;
                if (transcript.isEmpty()) { main.post(() -> { if (valid(id)) listen(); }); return; }
                publish(id, "thinking", transcript);
                main.postDelayed(() -> { if (valid(id) && round == turn && "thinking".equals(VoiceEvents.phase)) end("这轮返回较慢，已停止采集；可查看对话后重试。", true); }, 90_000);
            } catch (Exception error) { main.post(() -> { if (valid(id)) end("语音没有接通，已停止采集。请检查麦克风、手机密钥和网络。", true); }); }
        });
    }
    private void publish(String id, String phase, String transcript) { main.post(() -> { if (valid(id)) VoiceEvents.emit(phase, id, "", transcript); }); }
    private void answer(String id, String text) {
        if (!valid(id) || answering || !"thinking".equals(VoiceEvents.phase)) return;
        if (text == null || text.trim().isEmpty() || text.length() > 4000) { end("这轮文字较长，请在对话里查看。", true); return; }
        answering = true;
        worker.execute(() -> {
            try {
                if (!valid(id)) return;
                byte[] audio = backend.speak(this, text);
                main.post(() -> {
                    if (!valid(id)) { java.util.Arrays.fill(audio, (byte)0); return; }
                    try {
                        player = new MediaPlayer();
                        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                        playback = new MemoryAudio(audio); player.setDataSource(playback);
                        player.setOnPreparedListener(ready -> { if (valid(id)) { VoiceEvents.emit("speaking", id, "", ""); ready.start(); } });
                        player.setOnCompletionListener(done -> { releasePlayer(); if (valid(id)) listen(); });
                        player.setOnErrorListener((broken, what, extra) -> { end("朗读未能播放，已结束语音。", true); return true; });
                        player.prepareAsync();
                    } catch (Exception error) { java.util.Arrays.fill(audio, (byte)0); end("朗读没有准备好，已结束语音。", true); }
                });
            } catch (Exception error) { main.post(() -> { if (valid(id)) end("朗读未接通，回复仍可在对话里查看。", true); }); }
        });
    }
    private void releasePlayer() { if (player != null) { try { player.stop(); } catch (IllegalStateException ignored) { } player.release(); player = null; } if (playback != null) { playback.close(); playback = null; } }
    private void end(String note, boolean error) {
        active = false; microphone.stop(); backend.cancel(); releasePlayer(); main.removeCallbacksAndMessages(null);
        abandonFocus();
        VoiceEvents.emit(error ? "error" : "idle", session == null ? "" : session, note, ""); stopSelf();
    }
    @Override public void onDestroy() {
        active = false; microphone.stop(); backend.cancel(); releasePlayer(); main.removeCallbacksAndMessages(null); worker.shutdownNow();
        if (observing) unregisterReceiver(screen);
        abandonFocus();
        if (current == this) current = null;
        if (!"error".equals(VoiceEvents.phase)) VoiceEvents.emit("idle", session == null ? "" : session, "语音已结束。", "");
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    private void abandonFocus() { if (focus != null) { getSystemService(AudioManager.class).abandonAudioFocusRequest(focus); focus = null; } }
    @Override public IBinder onBind(Intent intent) { return null; }
}
