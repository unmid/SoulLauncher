package dev.soulclient.ui;

import com.mojang.blaze3d.pipeline.RenderPipeline;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Identifier;

/** Texture adapter — GUI_TEXTURED pipeline, 2D matrices (Minecraft 1.21.9+). */
public final class SoulTex {

    private SoulTex() {
    }

    private static final Identifier WALLPAPER = Identifier.of("soulclient", "textures/gui/soul_wallpaper.png");
    private static final Identifier LOGO = Identifier.of("soulclient", "textures/gui/soul_logo.png");
    public static final int WALL_W = 1280;
    public static final int WALL_H = 800;
    public static final int LOGO_SIZE = 256;

    public static void wallpaper(DrawContext ctx, int screenW, int screenH) {
        SoulGfx.push(ctx);
        SoulGfx.scale(ctx, (float) screenW / WALL_W, (float) screenH / WALL_H);
        ctx.drawTexture(RenderPipelines.GUI_TEXTURED, WALLPAPER, 0, 0, 0f, 0f,
                WALL_W, WALL_H, WALL_W, WALL_H, 0xFFFFFFFF);
        SoulGfx.pop(ctx);
    }

    public static void logo(DrawContext ctx, int x, int y, int size) {
        SoulGfx.push(ctx);
        SoulGfx.translate(ctx, x, y);
        float s = (float) size / LOGO_SIZE;
        SoulGfx.scale(ctx, s, s);
        ctx.drawTexture(RenderPipelines.GUI_TEXTURED, LOGO, 0, 0, 0f, 0f,
                LOGO_SIZE, LOGO_SIZE, LOGO_SIZE, LOGO_SIZE, 0xFFFFFFFF);
        SoulGfx.pop(ctx);
    }
}
