package dev.soulclient.ui;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Identifier;

/**
 * Texture adapters — isolated per Minecraft version so screen code never
 * touches drawTexture/matrix APIs that drift between releases.
 * All draws are1:1 at native size inside a scale matrix, so the overload
 * semantics (stretch vs region) cannot bite us.
 */
public final class SoulTex {

    private SoulTex() {
    }

    private static final Identifier WALLPAPER = Identifier.of("soulclient", "textures/gui/soul_wallpaper.png");
    private static final Identifier LOGO = Identifier.of("soulclient", "textures/gui/soul_logo.png");
    public static final int WALL_W = 1280;
    public static final int WALL_H = 800;
    public static final int LOGO_SIZE = 256;

    public static void wallpaper(DrawContext ctx, int screenW, int screenH) {
        ctx.getMatrices().push();
        ctx.getMatrices().scale((float) screenW / WALL_W, (float) screenH / WALL_H, 1f);
        ctx.drawTexture(WALLPAPER, 0, 0, 0f, 0f, WALL_W, WALL_H, WALL_W, WALL_H);
        ctx.getMatrices().pop();
    }

    public static void logo(DrawContext ctx, int x, int y, int size) {
        ctx.getMatrices().push();
        ctx.getMatrices().translate(x, y, 0f);
        float s = (float) size / LOGO_SIZE;
        ctx.getMatrices().scale(s, s, 1f);
        ctx.drawTexture(LOGO, 0, 0, 0f, 0f, LOGO_SIZE, LOGO_SIZE, LOGO_SIZE, LOGO_SIZE);
        ctx.getMatrices().pop();
    }
}
