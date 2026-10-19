package com.yiyu.mobile;

/** Run with the pure PetGeometry source; no Android emulator or real user state. */
public final class PetGeometryCheck {
    private static void check(boolean result, String label) { if (!result) throw new AssertionError(label); }
    public static void main(String[] args) {
        PetGeometry.Area portrait = new PetGeometry.Area(12, 45, 388, 820);
        PetGeometry.Placement left = PetGeometry.place(portrait, 100, 125, 18, 340, true, 30);
        check(left.x == 12 && left.pose.equals("left-edge"), "left safe edge");
        PetGeometry.Placement right = PetGeometry.place(portrait, 100, 125, 284, 340, true, 30);
        check(right.x == 288 && right.pose.equals("right-edge"), "right safe edge");
        PetGeometry.Placement bottom = PetGeometry.place(portrait, 100, 125, 160, 690, true, 30);
        check(bottom.y == 695 && bottom.pose.equals("bottom-edge"), "bottom avoids navigation bar");
        check(PetGeometry.place(portrait, 100, 125, 150, 300, true, 30).pose.equals("float"), "middle remains free");
        PetGeometry.Placement outside = PetGeometry.place(portrait, 100, 125, -500, 9999, false, 30);
        check(outside.x == 12 && outside.y == 695, "drag stays in safe bounds");
        PetGeometry.Area landscape = new PetGeometry.Area(44, 20, 820, 360);
        PetGeometry.Placement rotated = PetGeometry.restore(landscape, 100, 125, .5f, .8f, "bottom-edge");
        check(rotated.x >= 44 && rotated.x + 100 <= 820 && rotated.y == 235, "rotation preserves dock");
        PetGeometry.Placement invalid = PetGeometry.restore(portrait, 100, 125, Float.NaN, Float.POSITIVE_INFINITY, "float");
        check(invalid.x == 288 && invalid.y >= 45 && invalid.y <= 695, "invalid preference clamps");
        PetGeometry.Area tiny = new PetGeometry.Area(0, 0, 40, 50);
        check(PetGeometry.place(tiny, 100, 125, 999, -99, true, 30).x == 0, "tiny screen clamps");
        System.out.println("YIYU_PET_GEOMETRY_OK: 8 geometry checks passed");
    }
}
