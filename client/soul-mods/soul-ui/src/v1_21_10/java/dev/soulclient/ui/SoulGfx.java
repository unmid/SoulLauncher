package dev.soulclient.ui;

import net.minecraft.client.gui.DrawContext;

/** Matrix-stack adapter — 2D JOML matrices (Minecraft 1.21.9+). */
public final class SoulGfx {

    private SoulGfx() {
    }

    public static void push(DrawContext ctx) {
        ctx.getMatrices().pushMatrix();
    }

    public static void pop(DrawContext ctx) {
        ctx.getMatrices().popMatrix();
    }

    public static void translate(DrawContext ctx, float x, float y) {
        ctx.getMatrices().translate(x, y);
    }

    public static void scale(DrawContext ctx, float sx, float sy) {
        ctx.getMatrices().scale(sx, sy);
    }
}
