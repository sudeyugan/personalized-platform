package com.yiyu.mobile;

/** Pure geometry: no display, permissions or user data dependencies. */
final class PetGeometry {
    static final class Area {
        final int left, top, right, bottom;
        Area(int left, int top, int right, int bottom) {
            this.left = left; this.top = top; this.right = Math.max(left + 1, right); this.bottom = Math.max(top + 1, bottom);
        }
        int width() { return right - left; }
        int height() { return bottom - top; }
    }
    static final class Placement {
        final int x, y; final String pose;
        Placement(int x, int y, String pose) { this.x = x; this.y = y; this.pose = pose; }
    }
    static int clamp(int value, int low, int high) { return Math.max(low, Math.min(Math.max(low, high), value)); }
    static Placement place(Area area, int width, int height, int x, int y, boolean snap, int threshold) {
        x = clamp(x, area.left, area.right - width); y = clamp(y, area.top, area.bottom - height);
        String pose = "float";
        if (snap) {
            int left = x - area.left, right = area.right - width - x, bottom = area.bottom - height - y;
            int nearest = Math.min(bottom, Math.min(left, right));
            if (nearest <= threshold) {
                if (bottom <= Math.min(left, right)) { pose = "bottom-edge"; y = Math.max(area.top, area.bottom - height); }
                else if (left <= right) { pose = "left-edge"; x = area.left; }
                else { pose = "right-edge"; x = Math.max(area.left, area.right - width); }
            }
        }
        return new Placement(x, y, pose);
    }
    static Placement restore(Area area, int width, int height, float nx, float ny, String pose) {
        nx = Float.isFinite(nx) ? Math.max(0, Math.min(1, nx)) : 1;
        ny = Float.isFinite(ny) ? Math.max(0, Math.min(1, ny)) : .4f;
        int x = area.left + Math.round(Math.max(0, area.width() - width) * nx), y = area.top + Math.round(Math.max(0, area.height() - height) * ny);
        if ("left-edge".equals(pose)) x = area.left;
        if ("right-edge".equals(pose)) x = Math.max(area.left, area.right - width);
        if ("bottom-edge".equals(pose)) y = Math.max(area.top, area.bottom - height);
        return new Placement(x, y, pose);
    }
}
