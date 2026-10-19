package com.yiyu.mobile;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.util.function.BooleanSupplier;

final class VoiceRecorder {
    private volatile AudioRecord recording;
    private final Object lifecycle = new Object();
    void stop() { synchronized (lifecycle) { AudioRecord current = recording; if (current != null) try { current.stop(); } catch (IllegalStateException ignored) { } } }
    byte[] capture(Context context, BooleanSupplier active, Runnable acquired) throws Exception {
        if (!active.getAsBoolean()) return null;
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) throw new SecurityException("microphone not granted");
        int minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new Exception("microphone format unavailable");
        AudioRecord source = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 3200));
        try {
            if (source.getState() != AudioRecord.STATE_INITIALIZED) throw new Exception("microphone initialization failed");
            synchronized (lifecycle) { if (!active.getAsBoolean()) return null; recording = source; source.startRecording(); }
            if (source.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new Exception("microphone not recording");
            if (!active.getAsBoolean()) return null;
            acquired.run();
            VoiceGate gate = new VoiceGate();
            ArrayDeque<byte[]> prefix = new ArrayDeque<>(); ByteArrayOutputStream utterance = new ByteArrayOutputStream();
            short[] samples = new short[320]; boolean speaking = false;
            while (active.getAsBoolean() && !Thread.currentThread().isInterrupted()) {
                int count = 0;
                while (count < samples.length && active.getAsBoolean()) {
                    int read = source.read(samples, count, samples.length - count, AudioRecord.READ_BLOCKING);
                    if (read <= 0) throw new Exception("microphone read failed");
                    count += read;
                }
                if (!active.getAsBoolean()) return null;
                double energy = 0; byte[] bytes = new byte[count * 2];
                for (int i = 0; i < count; i++) { energy += (double)samples[i] * samples[i]; bytes[i * 2] = (byte)samples[i]; bytes[i * 2 + 1] = (byte)(samples[i] >> 8); }
                int state = gate.accept(Math.sqrt(energy / count));
                if (state == VoiceGate.START) { speaking = true; for (byte[] previous : prefix) utterance.write(previous); }
                if (speaking) utterance.write(bytes); else { prefix.addLast(bytes); while (prefix.size() > 12) prefix.removeFirst(); }
                if (state == VoiceGate.END) return VoiceGate.wav(utterance.toByteArray());
                if (state == VoiceGate.IDLE_END) return null;
                if (state == VoiceGate.DISCARD) return new byte[0];
            }
            return null;
        } finally { synchronized (lifecycle) { if (recording == source) recording = null; try { source.stop(); } catch (IllegalStateException ignored) { } source.release(); } }
    }
}
