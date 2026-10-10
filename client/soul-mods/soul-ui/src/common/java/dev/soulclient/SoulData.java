package dev.soulclient;

import java.util.List;

/** Content shown on the Soul Client home screen (no Minecraft imports). */
public final class SoulData {
    private SoulData() {
    }

    public record Featured(String initials, String name, String address, String tag) {
    }

    /** Featured community servers, mirroring the launcher's Servers page. */
    public static final List<Featured> FEATURED = List.of(
            new Featured("HY", "Hypixel", "mc.hypixel.net", "MINIGAMES"),
            new Featured("WY", "Wynncraft", "play.wynncraft.com", "MMO"),
            new Featured("2B", "2b2t", "2b2t.org", "VANILLA")
    );
}
