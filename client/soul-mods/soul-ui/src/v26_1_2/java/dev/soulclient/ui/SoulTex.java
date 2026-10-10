package dev.soulclient.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/** Texture adapter — GUI_TEXTURED pipeline, 2D matrices (Minecraft 26.1+). */
public final class SoulTex {

    private SoulTex() {
    }

    private static final Identifier WALLPAPER =
            Identifier.fromNamespaceAndPath("soulclient", "textures/gui/soul_wallpaper.png");
    private static final Identifier LOGO =
            Identifier.fromNamespaceAndPath("soulclient", "textures/gui/soul_logo.png");
    public static final int WALL_W = 1280;
    public static final int WALL_H = 800;
    public static final int LOGO_SIZE = 256;

    public static void wallpaper(GuiGraphicsExtractor g, int screenW, int screenH) {
        SoulGfx.push(g);
        SoulGfx.scale(g, (float) screenW / WALL_W, (float) screenH / WALL_H);
        g.blitSprite(RenderPipelines.GUI_TEXTURED, WALLPAPER, 0, 0, WALL_W, WALL_H, 0, 0, WALL_W, WALL_H);
        SoulGfx.pop(g);
    }

    public static void logo(GuiGraphicsExtractor g, int x, int y, int size) {
        SoulGfx.push(g);
        SoulGfx.translate(g, x, y);
        float s = (float) size / LOGO_SIZE;
        SoulGfx.scale(g, s, s);
        g.blitSprite(RenderPipelines.GUI_TEXTURED, LOGO, 0, 0, LOGO_SIZE, LOGO_SIZE, 0, 0, LOGO_SIZE, LOGO_SIZE);
        SoulGfx.pop(g);
    }
}
