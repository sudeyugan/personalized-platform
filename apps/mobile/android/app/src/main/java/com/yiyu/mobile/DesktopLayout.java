package com.yiyu.mobile;

import java.util.ArrayList;

/** Narrow node port deliberately has no text, input, actions, IDs or screenshot capability. */
final class DesktopLayout {
    interface Node extends AutoCloseable {
        String owner(); String type(); boolean visible();
        PetSurfaceGeometry.Surface bounds();
        int children(); Node child(int index);
        @Override void close();
    }
    static PetSurfaceGeometry.Surface[] scan(Node root, String home, float density) {
        ArrayList<PetSurfaceGeometry.Surface> found = new ArrayList<>();
        try (Node owned = root) {
            if (owned != null && home != null && !home.isEmpty()) collect(owned, home, density, found, new int[]{400}, 0);
        }
        return found.toArray(new PetSurfaceGeometry.Surface[0]);
    }
    private static void collect(Node node, String home, float density, ArrayList<PetSurfaceGeometry.Surface> found, int[] budget, int depth) {
        if (--budget[0] < 0 || depth > 16 || found.size() >= 24 || !home.equals(node.owner()) || !node.visible()) return;
        if (node.type().endsWith("AppWidgetHostView")) {
            PetSurfaceGeometry.Surface bounds = node.bounds();
            if (bounds.right - bounds.left >= 48 * density && bounds.bottom - bounds.top >= 36 * density) found.add(bounds);
            return; // Never inspect the inside of a widget, including its provider's private views.
        }
        int children = Math.min(node.children(), 64);
        for (int i = 0; i < children && budget[0] > 0 && found.size() < 24; i++) {
            try (Node child = node.child(i)) { if (child != null) collect(child, home, density, found, budget, depth + 1); }
        }
    }
}
