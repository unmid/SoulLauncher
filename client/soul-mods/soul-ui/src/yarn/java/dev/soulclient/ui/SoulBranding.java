package dev.soulclient.ui;

import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.screen.Screen;

/** Soul Client chrome drawn over the vanilla multiplayer browser. */
public final class SoulBranding {

    private SoulBranding() {
    }

    public static void decorate(Screen screen) {
        ScreenEvents.afterRender(screen).register((s, context, mouseX, mouseY, tickDelta) -> {
            MinecraftClient client = MinecraftClient.getInstance();
            TextRenderer font = client.textRenderer;
            SoulPaint.hGradient(context, 0, 0, s.width, 44, 0xE605070B, 0x0005070B);
            SoulPaint.divider(context, 0, 43, s.width, SoulTheme.LINE_SOFT);
            SoulTex.logo(context, 14, 9, 26);
            SoulPaint.tracked(context, font, "SOUL CLIENT", 50, 18, SoulTheme.ACCENT);
            SoulPaint.textCentered(context, font, "MULTIPLAYER", s.width / 2 + 60, 18, SoulTheme.TEXT);
            String ver = "MC " + SoulMc.mcVersion();
            SoulPaint.tracked(context, font, ver, s.width - SoulPaint.trackedWidth(font, ver) - 16, 18,
                    SoulTheme.TEXT_FAINT);
            SoulPaint.pill(context, s.width - 92, 12, 76, 20, SoulTheme.CARD);
            SoulPaint.icon(context, SoulIcons.PLAY, s.width - 86, 18, 1, SoulTheme.ACCENT);
            SoulPaint.text(context, font, "Soul Client", s.width - 72, 18, SoulTheme.TEXT_DIM);
        });
    }
}

