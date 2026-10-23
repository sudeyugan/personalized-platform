package com.yiyu.mobile;

import java.util.ArrayList;

/** Deterministic launcher-only fixtures: no Android permission, user desktop or network used. */
public final class DesktopSenseCheck {
    private static int checks;
    private static void check(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    private static final class Node implements DesktopLayout.Node {
        String owner = "fixture.home", type = "android.view.View";
        boolean visible = true, closed, forbiddenChildren;
        int visits;
        PetSurfaceGeometry.Surface rectangle = new PetSurfaceGeometry.Surface(40, 360, 320, 520);
        final ArrayList<Node> nodes = new ArrayList<>();
        Node add(Node child) { nodes.add(child); return this; }
        public String owner() { return owner; }
        public String type() { return type; }
        public boolean visible() { return visible; }
        public PetSurfaceGeometry.Surface bounds() { return rectangle; }
        public int children() { if (forbiddenChildren) throw new AssertionError("private subtree entered"); return nodes.size(); }
        public Node child(int index) { visits++; return nodes.get(index); }
        public void close() { closed = true; }
    }
    private static Node widget() { Node value = new Node(); value.type = "fixture.MiuiAppWidgetHostView"; value.forbiddenChildren = true; return value; }
    public static void main(String[] args) {
        Node root = new Node(), widget = widget(); root.add(widget);
        PetSurfaceGeometry.Surface[] result = DesktopLayout.scan(root, "fixture.home", 1);
        check(result.length == 1 && result[0].top == 360 && widget.visits == 0, "only outer widget bounds");
        check(root.closed && widget.closed, "all nodes closed");
        Node other = new Node(); other.owner = "fixture.bank"; other.forbiddenChildren = true;
        check(DesktopLayout.scan(other, "fixture.home", 1).length == 0 && other.closed, "foreground race rejects other app before children");
        Node foreign = new Node(); foreign.owner = "fixture.widget.provider"; foreign.forbiddenChildren = true;
        check(DesktopLayout.scan(new Node().add(foreign), "fixture.home", 1).length == 0, "provider content excluded");
        Node icon = new Node(); icon.type = "android.widget.TextView";
        check(DesktopLayout.scan(new Node().add(icon), "fixture.home", 1).length == 0, "icons and labels not guessed as ledges");
        Node hidden = widget(); hidden.visible = false;
        check(DesktopLayout.scan(new Node().add(hidden), "fixture.home", 1).length == 0, "hidden widget not a surface");
        Node crowded = new Node(); for (int i = 0; i < 100; i++) crowded.add(widget());
        check(DesktopLayout.scan(crowded, "fixture.home", 1).length == 24 && crowded.visits == 24, "bounded candidate count");
        Node wide = new Node(); for (int i = 0; i < 500; i++) wide.add(new Node());
        DesktopLayout.scan(wide, "fixture.home", 1);
        check(wide.visits == 64, "bounded branching");
        Node deep = new Node(), cursor = deep; for (int i = 0; i < 100; i++) { Node child = new Node(); cursor.add(child); cursor = child; }
        cursor.add(widget());
        check(DesktopLayout.scan(deep, "fixture.home", 1).length == 0, "bounded depth");
        check(DesktopLayout.scan(widget(), "", 1).length == 0, "no resolved launcher no traversal");
        PetGeometry.Area area = new PetGeometry.Area(0, 24, 400, 840);
        PetSurfaceGeometry.Surface surface = new PetSurfaceGeometry.Surface(40, 360, 320, 520);
        int seated = PetSurfaceGeometry.seatedY(surface, 128);
        check(Math.abs(seated + 128 * PetSurfaceGeometry.SEAT_Y - 360) < 1, "hips land on widget not shoes");
        check(PetSurfaceGeometry.nearby(new PetSurfaceGeometry.Surface[]{surface}, area, 96, 128, 100, seated + 10, 32) == surface, "nearby drop offers contact");
        check(PetSurfaceGeometry.nearby(new PetSurfaceGeometry.Surface[]{surface}, area, 96, 128, 100, seated + 60, 32) == null, "far away no magnetic jump");
        check(PetSurfaceGeometry.nearby(new PetSurfaceGeometry.Surface[]{surface}, area, 96, 128, 340, seated, 32) == null, "horizontal support required");
        PetSurfaceGeometry.Surface top = new PetSurfaceGeometry.Surface(20, 30, 300, 200);
        check(PetSurfaceGeometry.nearby(new PetSurfaceGeometry.Surface[]{top}, area, 96, 128, 100, 24, 100) == null, "head cannot leave safe area");
        PetContacts contacts = new PetContacts();
        contacts.update(true, new PetSurfaceGeometry.Surface[]{surface}, area, 96, 128, 100, seated, 36);
        check(contacts.nearby(area, 96, 128, 100, seated, 32) == surface, "visible page candidates available");
        contacts.attach(surface, 128);
        PetSurfaceGeometry.Surface moved = new PetSurfaceGeometry.Surface(50, 368, 330, 528);
        PetGeometry.Placement follow = contacts.update(true, new PetSurfaceGeometry.Surface[]{moved}, area, 96, 128, 100, seated, 36);
        check(follow.x == 110 && follow.y == seated + 8 && contacts.attached(), "small component move keeps contact");
        PetGeometry.Placement leave = contacts.update(false, new PetSurfaceGeometry.Surface[]{moved}, area, 96, 128, 110, seated + 8, 36);
        check(leave.pose.equals("float") && !contacts.attached() && contacts.nearby(area, 96, 128, 100, seated, 32) == null, "leaving home clears attachment and geometry");
        contacts.attach(surface, 128);
        check(contacts.update(true, new PetSurfaceGeometry.Surface[0], area, 96, 128, 100, seated, 36).pose.equals("float"), "widget removal detaches");
        contacts.attach(surface, 128);
        PetSurfaceGeometry.Surface nextPage = new PetSurfaceGeometry.Surface(180, 600, 380, 800);
        check(contacts.update(true, new PetSurfaceGeometry.Surface[]{nextPage}, area, 96, 128, 100, seated, 36).pose.equals("float"), "unrelated page never followed");
        System.out.println("YIYU_DESKTOP_SENSE_OK: " + checks + " privacy and contact checks passed");
    }
}
