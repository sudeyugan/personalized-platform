package com.yiyu.mobile;

import android.content.Context;
import android.content.SharedPreferences;

final class PetPreferences {
    private static final String NAME = "yiyu-mobile-pet-v2";
    static SharedPreferences get(Context context) { return context.getSharedPreferences(NAME, 0); }
    static boolean configure(Context context, String style, double scale, boolean motion) {
        if (!("pixel".equals(style) || "chibi".equals(style) || "detailed".equals(style)) || !Double.isFinite(scale) || scale < .7 || scale > 1.4) return false;
        return get(context).edit().putString("style", style).putFloat("scale", (float) scale).putBoolean("motion", motion).commit();
    }
    static void position(Context context, PetGeometry.Area area, int width, int height, int x, int y, String pose) {
        float nx = Math.max(0, Math.min(1, (x - area.left) / (float) Math.max(1, area.width() - width)));
        float ny = Math.max(0, Math.min(1, (y - area.top) / (float) Math.max(1, area.height() - height)));
        get(context).edit().putFloat("nx", nx).putFloat("ny", ny).putString("pose", pose).apply();
    }
}
