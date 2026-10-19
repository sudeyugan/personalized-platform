package com.yiyu.mobile;

/** An exported launcher Intent is not consent to start a microphone. */
final class VoiceLaunchGate {
    private String nonce;
    private long issued;
    synchronized String issue(long now) { nonce = java.util.UUID.randomUUID().toString(); issued = now; return nonce; }
    synchronized boolean consume(String value, long now) {
        if (nonce == null || value == null || !nonce.equals(value) || now < issued || now - issued > 15_000) return false;
        nonce = null; return true;
    }
}
