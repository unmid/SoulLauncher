package dev.soulclient.ui;

import net.minecraft.client.gui.DrawContext;

/** Matrix-stack adapter — 3D matrices (Minecraft 1.21.1). */
public final class SoulGfx {

    private SoulGfx() {
    }

    public static void push(DrawContext ctx) {
        ctx.getMatrices().push();
    }

    public static void pop(DrawContext ctx) {
        ctx.getMatrices().pop();
    }

    public static void translate(DrawContext ctx, float x, float y) {
        ctx.getMatrices().translate(x, y, 0f);
    }

    public static void scale(DrawContext ctx, float sx, float sy) {
        ctx.getMatrices().scale(sx, sy, 1f);
    }
}
