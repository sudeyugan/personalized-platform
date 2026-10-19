package com.yiyu.mobile;

import android.media.MediaDataSource;
final class MemoryAudio extends MediaDataSource {
    private volatile byte[] data;
    MemoryAudio(byte[] data) { this.data = data; }
    @Override public int readAt(long position, byte[] target, int offset, int size) {
        byte[] source = data;
        if (position < 0 || source == null || position >= source.length) return -1;
        int count = Math.min(size, source.length - (int)position); System.arraycopy(source, (int)position, target, offset, count); return count;
    }
    @Override public long getSize() { return data == null ? 0 : data.length; }
    @Override public void close() { if (data != null) java.util.Arrays.fill(data, (byte)0); data = null; }
}
