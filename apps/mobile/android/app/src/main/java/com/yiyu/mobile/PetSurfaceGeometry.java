package com.yiyu.mobile;

/** Layout-only contacts. No Android nodes, labels, identifiers or persistence. */
final class PetSurfaceGeometry {
    static final float SEAT_Y = 165f / 256f;
    static final class Surface {
        final int left, top, right, bottom;
        Surface(int left, int top, int right, int bottom) {
            this.left = left; this.top = top; this.right = right; this.bottom = bottom;
        }
    }
    static Surface nearby(Surface[] surfaces, PetGeometry.Area area, int width, int height, int x, int y, int threshold) {
        Surface best = null;
        float distance = threshold + 1;
        int center = x + width / 2;
        for (Surface surface : surfaces) {
            int targetY = Math.round(surface.top - height * SEAT_Y);
            float gap = Math.abs(y - targetY);
            if (surface.right - surface.left < width / 2 || center < surface.left + width / 6 || center > surface.right - width / 6) continue;
            if (targetY < area.top || targetY + height > area.bottom || surface.top >= surface.bottom) continue;
            if (gap <= threshold && gap < distance) { best = surface; distance = gap; }
        }
        return best;
    }
    static Surface follow(Surface old, Surface[] surfaces, int tolerance) {
        Surface best = null; long bestDistance = Long.MAX_VALUE;
        for (Surface next : surfaces) {
            // Never attach to an unrelated widget on another page or jump across the screen.
            if (Math.abs(next.left - old.left) > tolerance || Math.abs(next.right - old.right) > tolerance || Math.abs(next.top - old.top) > tolerance) continue;
            long distance = Math.abs(next.left - old.left) + Math.abs(next.right - old.right) + Math.abs(next.top - old.top);
            if (distance < bestDistance) { best = next; bestDistance = distance; }
        }
        return best;
    }
    static int seatedY(Surface surface, int height) { return Math.round(surface.top - height * SEAT_Y); }
}
