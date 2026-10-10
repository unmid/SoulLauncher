package dev.soulclient.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;

/**
 * Soul HUD: a compact glass readout with FPS, coordinates, ping and a
 * Soul watermark, toggled with F6. Uses the same rounded/pixel language as
 * the Soul Client menus.
 */
public class SoulHud implements ClientModInitializer {
    private static final int ACCENT = 0xFF5EEAD4;
    private static final int TEXT = 0xFFF4F8FF;
    private static final int DIM = 0xB8F4F8FF;
    private static final int FAINT = 0x78F4F8FF;
    private static final int PANEL = 0xB40B0F16;
    private static final int LINE = 0x26FFFFFF;

    private static KeyBinding toggleKey;
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
        MinecraftClient client = MinecraftClient.getInstance();
        String line = client.getCurrentFps() + " FPS";
        if (client.player == null) {
            return line + " · in menu";
        }
        var pos = client.player.getBlockPos();
        line += " · " + pos.getX() + " " + pos.getY() + " " + pos.getZ();
        if (client.getNetworkHandler() != null) {
            var entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
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
            while (toggleKey.wasPressed()) {
                visible = !visible;
            }
        });

        HudRenderCallback.EVENT.register((context, tickDelta) -> {
            MinecraftClient client = MinecraftClient.getInstance();
            if (!visible || client.player == null || client.options.hudHidden) {
                return;
            }
            TextRenderer font = client.textRenderer;
            int fps = client.getCurrentFps();
            var pos = client.player.getBlockPos();
            String coords = pos.getX() + " " + pos.getY() + " " + pos.getZ();
            int ping = -1;
            if (client.getNetworkHandler() != null) {
                var entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
                if (entry != null) {
                    ping = entry.getLatency();
                }
            }

            int labelW = font.getWidth("SOUL CLIENT") + 14;
            int statW = Math.max(font.getWidth(fps + " FPS"), font.getWidth(coords)) + 14;
            int w = labelW + statW + (ping > 0 ? font.getWidth(ping + " ms") + 16 : 0);
            int h = 30;
            int x = 6;
            int y = 6;

            // panel with rounded corners
            for (int row = 0; row < h; row++) {
                int inset = insetForRow(row, h, 7);
                int alpha = PANEL >>> 24;
                int c = (alpha << 24) | (PANEL & 0x00FFFFFF);
                if (inset <= 0) {
                    context.fill(x, y + row, x + w, y + row + 1, c);
                } else {
                    context.fill(x + inset, y + row, x + w - inset, y + row + 1, c);
                }
            }
            // top gloss + border
            context.fill(x + 6, y, x + w - 6, y + 1, 0x22FFFFFF);
            context.fill(x + 1, y, x + w - 1, y + 1, LINE);
            context.fill(x + 1, y + h - 1, x + w - 1, y + h, LINE);
            context.fill(x, y + 4, x + 1, y + h - 4, LINE);
            context.fill(x + w - 1, y + 4, x + w, y + h - 4, LINE);
            // accent tab
            context.fill(x + 1, y + 8, x + 3, y + h - 8, ACCENT);

            context.drawTextWithShadow(font, "SOUL CLIENT", x + 10, y + 5, ACCENT);
            int col = x + 10 + labelW;
            context.drawTextWithShadow(font, fps + " FPS", col, y + 5, TEXT);
            context.drawTextWithShadow(font, coords, col, y + 16, DIM);
            if (ping > 0) {
                int px = col + statW;
                context.drawTextWithShadow(font, ping + " ms", px, y + 5, TEXT);
                // ping strength bars
                int bars = Math.max(1, Math.min(4, 5 - ping / 60));
                for (int i = 0; i < 4; i++) {
                    int bh = 3 + i * 2;
                    int bc = i < bars ? (ping < 80 ? ACCENT : 0xFFFBBF24) : 0x33FFFFFF;
                    context.fill(px - 10 + i * 2, y + 20 - bh, px - 9 + i * 2, y + 20, bc);
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
