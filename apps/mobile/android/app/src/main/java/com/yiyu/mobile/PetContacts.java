package com.yiyu.mobile;

/** A transient attachment belongs to this visible launcher page, never to a saved coordinate. */
final class PetContacts {
    private PetSurfaceGeometry.Surface[] surfaces = new PetSurfaceGeometry.Surface[0];
    private PetSurfaceGeometry.Surface attached;
    void clearAttachment() { attached = null; }
    boolean attached() { return attached != null; }
    PetSurfaceGeometry.Surface nearby(PetGeometry.Area area, int width, int height, int x, int y, int distance) {
        return PetSurfaceGeometry.nearby(surfaces, area, width, height, x, y, distance);
    }
    int attach(PetSurfaceGeometry.Surface surface, int height) { attached = surface; return PetSurfaceGeometry.seatedY(surface, height); }
    PetGeometry.Placement update(boolean home, PetSurfaceGeometry.Surface[] next, PetGeometry.Area area, int width, int height, int x, int y, int tolerance) {
        surfaces = home ? next : new PetSurfaceGeometry.Surface[0];
        if (attached == null) return null;
        PetSurfaceGeometry.Surface found = PetSurfaceGeometry.follow(attached, surfaces, tolerance);
        if (found != null) {
            int nextX = x + (found.left - attached.left), nextY = PetSurfaceGeometry.seatedY(found, height);
            attached = found;
            if (nextX >= area.left && nextX + width <= area.right && nextY >= area.top && nextY + height <= area.bottom)
                return new PetGeometry.Placement(nextX, nextY, "perch");
        }
        attached = null;
        return PetGeometry.place(area, width, height, x, y, false, 0);
    }
}
