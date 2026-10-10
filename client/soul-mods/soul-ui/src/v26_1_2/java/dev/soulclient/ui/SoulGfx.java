package dev.soulclient.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Matrix-stack adapter — 2D JOML matrices (Minecraft 26.1+). */
public final class SoulGfx {

    private SoulGfx() {
    }

    public static void push(GuiGraphicsExtractor g) {
        g.pose().pushMatrix();
    }

    public static void pop(GuiGraphicsExtractor g) {
        g.pose().popMatrix();
    }

    public static void translate(GuiGraphicsExtractor g, float x, float y) {
        g.pose().translate(x, y);
    }

    public static void scale(GuiGraphicsExtractor g, float sx, float sy) {
        g.pose().scale(sx, sy);
    }
}
