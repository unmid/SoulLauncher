package dev.soulclient.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;

/** Soul HUD for Minecraft 26.1+ (official names). */
public class SoulHud implements ClientModInitializer {
    private static final int ACCENT = 0xFF5EEAD4;
    private static final int TEXT = 0xFFF4F8FF;
    private static final int DIM = 0xB8F4F8FF;
    private static final int PANEL = 0xB40B0F16;
    private static final int LINE = 0x26FFFFFF;

    private static KeyMapping toggleKey;
    public static boolean visible = true;

    public static void toggle() {
        visible = !visible;
    }

    /**
     * Live readout line for the Soul menu's Readouts tile —
     * "144 FPS · 100 64 -200 · 42 ms". Values mirror the on-screen HUD and
     * are computed regardless of {@link #visible} so the menu can preview them.
     */
    public static String readouts() {
        Minecraft minecraft = Minecraft.getInstance();
        String line = minecraft.getFps() + " FPS";
        if (minecraft.player == null) {
            return line + " · in menu";
        }
        var pos = minecraft.player.blockPosition();
        line += " · " + pos.getX() + " " + pos.getY() + " " + pos.getZ();
        if (minecraft.getConnection() != null) {
            var entry = minecraft.getConnection().getPlayerInfo(minecraft.player.getUUID());
            if (entry != null && entry.getLatency() > 0) {
                line += " · " + entry.getLatency() + " ms";
            }
        }
        return line;
    }

    @Override
    public void onInitializeClient() {
        toggleKey = HudKey.registerF6();

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (toggleKey.consumeClick()) {
                visible = !visible;
            }
        });

        HudElementRegistry.addFirst(
                Identifier.fromNamespaceAndPath("soulhud", "overlay"),
                (graphics, tickCounter) -> {
                    Minecraft minecraft = Minecraft.getInstance();
                    if (!visible || minecraft.player == null || minecraft.options.hideGui) {
                        return;
                    }
                    Font font = minecraft.font;
                    int fps = minecraft.getFps();
                    var pos = minecraft.player.blockPosition();
                    String coords = pos.getX() + " " + pos.getY() + " " + pos.getZ();
                    int ping = -1;
                    if (minecraft.getConnection() != null) {
                        var entry = minecraft.getConnection().getPlayerInfo(minecraft.player.getUUID());
                        if (entry != null) {
                            ping = entry.getLatency();
                        }
                    }

                    int labelW = font.width("SOUL CLIENT") + 14;
                    int statW = Math.max(font.width(fps + " FPS"), font.width(coords)) + 14;
                    int w = labelW + statW + (ping > 0 ? font.width(ping + " ms") + 16 : 0);
                    int h = 30;
                    int x = 6;
                    int y = 6;

                    for (int row = 0; row < h; row++) {
                        int inset = insetForRow(row, h, 7);
                        if (inset <= 0) {
                            graphics.fill(x, y + row, x + w, y + row + 1, PANEL);
                        } else {
                            graphics.fill(x + inset, y + row, x + w - inset, y + row + 1, PANEL);
                        }
                    }
                    graphics.fill(x + 6, y, x + w - 6, y + 1, 0x22FFFFFF);
                    graphics.fill(x + 1, y, x + w - 1, y + 1, LINE);
                    graphics.fill(x + 1, y + h - 1, x + w - 1, y + h, LINE);
                    graphics.fill(x, y + 4, x + 1, y + h - 4, LINE);
                    graphics.fill(x + w - 1, y + 4, x + w, y + h - 4, LINE);
                    graphics.fill(x + 1, y + 8, x + 3, y + h - 8, ACCENT);

                    graphics.text(font, "SOUL CLIENT", x + 10, y + 5, ACCENT, true);
                    int col = x + 10 + labelW;
                    graphics.text(font, fps + " FPS", col, y + 5, TEXT, true);
                    graphics.text(font, coords, col, y + 16, DIM, true);
                    if (ping > 0) {
                        int px = col + statW;
                        graphics.text(font, ping + " ms", px, y + 5, TEXT, true);
                        int bars = Math.max(1, Math.min(4, 5 - ping / 60));
                        for (int i = 0; i < 4; i++) {
                            int bh = 3 + i * 2;
                            int bc = i < bars ? (ping < 80 ? ACCENT : 0xFFFBBF24) : 0x33FFFFFF;
                            graphics.fill(px - 10 + i * 2, y + 20 - bh, px - 9 + i * 2, y + 20, bc);
                        }
                    }
                });
    }

    private static int insetForRow(int y, int height, int radius) {
        if (radius <= 0) {
            return 0;
        }
        int r = Math.min(radius, height / 2);
        int top = y;
        int bottom = height - 1 - y;
        if (top >= r || bottom >= r) {
            return 0;
        }
        int d = Math.min(r - top, r - bottom);
        float inner = r - d;
        float v = r * r - inner * inner;
        return Math.min(r, (int) Math.ceil(r - Math.sqrt(Math.max(0f, v))));
    }
}
