package com.yiyu.mobile;

/** Pure JVM regression checks; no microphone, provider key or Android device. */
public final class VoiceGateCheck {
    private static void check(boolean result, String label) { if (!result) throw new AssertionError(label); }
    public static void main(String[] args) {
        VoiceGate idle = new VoiceGate();
        for (int i = 0; i < 2999; i++) check(idle.accept(20) == VoiceGate.WAIT, "idle remains bounded");
        check(idle.accept(20) == VoiceGate.IDLE_END, "60-second idle ends");
        VoiceGate speech = new VoiceGate();
        check(speech.accept(1600) == VoiceGate.WAIT && speech.accept(1600) == VoiceGate.WAIT && speech.accept(1600) == VoiceGate.START, "three voiced frames start");
        for (int i = 0; i < 20; i++) check(speech.accept(1600) == VoiceGate.CONTINUE, "speech retained");
        for (int i = 0; i < 44; i++) check(speech.accept(20) == VoiceGate.CONTINUE, "natural pause retained");
        check(speech.accept(20) == VoiceGate.END, "900ms silence ends utterance");
        VoiceGate click = new VoiceGate();
        for (int i = 0; i < 3; i++) click.accept(1600);
        for (int i = 0; i < 44; i++) click.accept(20);
        check(click.accept(20) == VoiceGate.DISCARD, "short click not sent");
        VoiceGate limit = new VoiceGate();
        for (int i = 0; i < 3; i++) limit.accept(1600);
        for (int i = 0; i < 999; i++) limit.accept(1600);
        check(limit.accept(1600) == VoiceGate.END, "20-second utterance bounded");
        byte[] wav = VoiceGate.wav(new byte[640]);
        check(wav.length == 684 && wav[0] == 'R' && wav[8] == 'W' && wav[40] == (byte)128 && wav[41] == 2, "PCM WAV header");
        VoiceLaunchGate gate = new VoiceLaunchGate();
        String token = gate.issue(100);
        check(!gate.consume("foreign", 101) && !gate.consume(null, 101), "external launcher cannot start microphone");
        check(gate.consume(token, 101) && !gate.consume(token, 102), "consent nonce single use");
        check(!gate.consume(gate.issue(1000), 16001), "stale consent expires");
        System.out.println("YIYU_VOICE_GATE_OK: idle, speech, noise, duration, WAV and launch-consent checks passed");
    }
}
