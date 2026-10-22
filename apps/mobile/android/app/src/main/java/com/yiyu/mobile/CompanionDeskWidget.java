package com.yiyu.mobile;

/** A seated companion, with the launcher's own clock refresh rather than polling. */
public final class CompanionDeskWidget extends CompanionWidget {
    @Override protected boolean desk() { return true; }
}
