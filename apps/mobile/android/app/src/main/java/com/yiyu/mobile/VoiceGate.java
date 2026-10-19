package com.yiyu.mobile;

/** 20ms frames; energy adapts only before speech. No microphone or network dependency. */
final class VoiceGate {
    static final int WAIT = 0, START = 1, CONTINUE = 2, END = 3, IDLE_END = 4, DISCARD = 5;
    private double floor = 140;
    private int hot, silence, frames, voiced;
    private boolean speaking;
    int accept(double rms) {
        frames++;
        boolean active = rms >= Math.max(380, floor * 3);
        if (!speaking) {
            if (!active) floor = Math.max(25, Math.min(700, floor * .98 + rms * .02));
            hot = active ? hot + 1 : 0;
            if (hot >= 3) { speaking = true; voiced = 3; frames = 0; return START; }
            return frames >= 3000 ? IDLE_END : WAIT;
        }
        if (active) { voiced++; silence = 0; } else silence++;
        return silence >= 45 || frames >= 1000 ? (voiced >= 12 ? END : DISCARD) : CONTINUE;
    }
    static byte[] wav(byte[] pcm) {
        byte[] result = new byte[44 + pcm.length];
        java.nio.ByteBuffer data = java.nio.ByteBuffer.wrap(result).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        data.put(new byte[]{'R','I','F','F'}).putInt(36 + pcm.length).put(new byte[]{'W','A','V','E','f','m','t',' '})
            .putInt(16).putShort((short)1).putShort((short)1).putInt(16000).putInt(32000).putShort((short)2).putShort((short)16)
            .put(new byte[]{'d','a','t','a'}).putInt(pcm.length).put(pcm);
        return result;
    }
}
