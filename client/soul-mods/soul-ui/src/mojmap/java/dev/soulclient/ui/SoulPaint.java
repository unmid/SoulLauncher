package dev.soulclient.ui;

import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Pixel-perfect UI painter (Minecraft 26.1+, official names). */
public final class SoulPaint {

    private SoulPaint() {
    }

    // ---------------------------------------------------------------- shapes

    public static void roundRect(GuiGraphicsExtractor g, int x, int y, int w, int h, int radius, int color) {
        if (w <= 0 || h <= 0) {
            return;
        }
        for (int row = 0; row < h; row++) {
            int inset = SoulTheme.insetForRow(row, h, radius);
            if (inset <= 0) {
                g.fill(x, y + row, x + w, y + row + 1, color);
            } else {
                g.fill(x + inset, y + row, x + w - inset, y + row + 1, color);
            }
        }
    }

    public static void roundRectOutline(GuiGraphicsExtractor g, int x, int y, int w, int h,
                                        int radius, int color) {
        if (w <= 0 || h <= 0) {
            return;
        }
        int prevInset = -1;
        for (int row = 0; row < h; row++) {
            int inset = SoulTheme.insetForRow(row, h, radius);
            int x0 = x + inset;
            int x1 = x + w - inset;
            if (row == 0 || row == h - 1) {
                if (x1 > x0) {
                    g.fill(x0, y + row, x1, y + row + 1, color);
                }
            } else {
                g.fill(x0, y + row, x0 + 1, y + row + 1, color);
                g.fill(x1 - 1, y + row, x1, y + row + 1, color);
                if (prevInset >= 0 && prevInset != inset) {
                    int inner = Math.min(prevInset, inset);
                    int outer = Math.max(prevInset, inset);
                    g.fill(x + inner, y + row, x + outer, y + row + 1, color);
                    g.fill(x + w - outer, y + row, x + w - inner, y + row + 1, color);
                }
            }
            prevInset = inset;
        }
    }

    public static void rectOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
        g.fill(x, y, x + w, y + 1, color);
        g.fill(x, y + h - 1, x + w, y + h, color);
        g.fill(x, y, x + 1, y + h, color);
        g.fill(x + w - 1, y, x + w, y + h, color);
    }

    public static void vGradient(GuiGraphicsExtractor g, int x, int y, int w, int h, int top, int bottom) {
        if (h <= 0) {
            return;
        }
        for (int row = 0; row < h; row++) {
            g.fill(x, y + row, x + w, y + row + 1, SoulTheme.mix(top, bottom, (float) row / (h - 1)));
        }
    }

    public static void hGradient(GuiGraphicsExtractor g, int x, int y, int w, int h, int left, int right) {
        if (w <= 0) {
            return;
        }
        for (int col = 0; col < w; col++) {
            g.fill(x + col, y, x + col + 1, y + h, SoulTheme.mix(left, right, (float) col / (w - 1)));
        }
    }

    public static void bottomScrim(GuiGraphicsExtractor g, int w, int height, int strength) {
        int band = Math.min(height, Math.max(90, height / 3));
        for (int row = 0; row < band; row++) {
            float t = (float) row / band;
            int a = (int) (strength * t * t);
            if (a > 0) {
                g.fill(0, height - band + row, w, height - band + row + 1, (a << 24));
            }
        }
    }

    public static void leftScrim(GuiGraphicsExtractor g, int height, int width, int strength) {
        for (int col = 0; col < width; col++) {
            float t = (float) col / width;
            int a = (int) (strength * (1f - t) * (1f - t));
            if (a > 0) {
                g.fill(col, 0, col + 1, height, (a << 24));
            }
        }
    }

    public static void topScrim(GuiGraphicsExtractor g, int w, int height, int strength) {
        int band = Math.min(height, 96);
        for (int row = 0; row < band; row++) {
            float t = (float) row / band;
            int a = (int) (strength * (1f - t));
            if (a > 0) {
                g.fill(0, row, w, row + 1, (a << 24));
            }
        }
    }

    public static void shadow(GuiGraphicsExtractor g, int x, int y, int w, int h, int radius,
                              int spread, int color) {
        for (int layer = spread; layer >= 1; layer--) {
            float t = (float) layer / spread;
            int a = (int) (SoulTheme.alpha(color) * (1f - t) * 0.55f);
            if (a <= 0) {
                continue;
            }
            roundRect(g, x - layer, y - layer + 2, w + layer * 2, h + layer * 2, radius + layer,
                    (a << 24) | (color & 0x00FFFFFF));
        }
    }

    public static void glow(GuiGraphicsExtractor g, int x, int y, int w, int h, int radius,
                            int color, int layers) {
        for (int layer = layers; layer >= 1; layer--) {
            float t = 1f - (float) layer / (layers + 1f);
            int a = (int) (SoulTheme.alpha(color) * t * 0.5f);
            if (a <= 0) {
                continue;
            }
            roundRectOutline(g, x - layer, y - layer, w + layer * 2, h + layer * 2, radius + layer,
                    (a << 24) | (color & 0x00FFFFFF));
        }
    }

    public static void accentGlow(GuiGraphicsExtractor g, int x, int y, int w, int h, int radius,
                                  float strength) {
        if (strength <= 0.01f) {
            return;
        }
        int a = (int) (SoulTheme.alpha(SoulTheme.ACCENT) * strength * 0.45f);
        for (int layer = 3; layer >= 1; layer--) {
            float t = 1f - (float) layer / 4f;
            int ca = (int) (a * t);
            if (ca <= 0) {
                continue;
            }
            roundRectOutline(g, x - layer, y - layer, w + layer * 2, h + layer * 2, radius + layer,
                    (ca << 24) | (SoulTheme.ACCENT & 0x00FFFFFF));
        }
    }

    public static void pill(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
        roundRect(g, x, y, w, h, h / 2, color);
    }

    public static void pillOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
        for (int row = 0; row < h; row++) {
            int inset = SoulTheme.insetForRow(row, h, h / 2);
            g.fill(x + inset, y + row, x + w - inset, y + row + 1, color);
        }
        g.fill(x + 1, y, x + w - 1, y + 1, color);
        g.fill(x + 1, y + h - 1, x + w - 1, y + h, color);
    }

    public static void divider(GuiGraphicsExtractor g, int x, int y, int w, int color) {
        g.fill(x, y, x + w, y + 1, color);
    }

    // ------------------------------------------------------------------ type

    public static void text(GuiGraphicsExtractor g, Font font, String s, int x, int y, int color) {
        g.text(font, s, x, y, color, true);
    }

    public static void textCentered(GuiGraphicsExtractor g, Font font, String s, int cx, int y, int color) {
        g.centeredText(font, s, cx, y, color);
    }

    public static void bold(GuiGraphicsExtractor g, Font font, String s, int x, int y, int color) {
        g.text(font, s, x, y, color, true);
        g.text(font, s, x + 1, y, color, true);
    }

    public static void boldCentered(GuiGraphicsExtractor g, Font font, String s, int cx, int y, int color) {
        bold(g, font, s, cx - font.width(s) / 2, y, color);
    }

    public static void outlined(GuiGraphicsExtractor g, Font font, String s, int x, int y,
                                int fill, int outline) {
        g.text(font, s, x - 1, y, outline, false);
        g.text(font, s, x + 1, y, outline, false);
        g.text(font, s, x, y - 1, outline, false);
        g.text(font, s, x, y + 1, outline, false);
        g.text(font, s, x, y, fill, true);
    }

    public static void outlinedCentered(GuiGraphicsExtractor g, Font font, String s, int cx, int y,
                                        int fill, int outline) {
        outlined(g, font, s, cx - font.width(s) / 2, y, fill, outline);
    }

    public static int tracked(GuiGraphicsExtractor g, Font font, String s, int x, int y, int color) {
        int cx = x;
        for (int i = 0; i < s.length(); i++) {
            String ch = s.substring(i, i + 1);
            g.text(font, ch, cx, y, color, true);
            cx += font.width(ch) + 1;
        }
        return cx - x - 1;
    }

    public static int trackedWidth(Font font, String s) {
        int w = 0;
        for (int i = 0; i < s.length(); i++) {
            w += font.width(s.substring(i, i + 1)) + 1;
        }
        return Math.max(0, w - 1);
    }

    public static void trackedCentered(GuiGraphicsExtractor g, Font font, String s, int cx, int y,
                                       int color) {
        tracked(g, font, s, cx - trackedWidth(font, s) / 2, y, color);
    }

    public static void display(GuiGraphicsExtractor g, Font font, String s, int x, int y,
                               float scale, int color) {
        SoulGfx.push(g);
        SoulGfx.translate(g, x + 1, y + 1);
        SoulGfx.scale(g, scale, scale);
        g.text(font, s, 0, 0, SoulTheme.SHADOW, true);
        SoulGfx.pop(g);
        SoulGfx.push(g);
        SoulGfx.translate(g, x, y);
        SoulGfx.scale(g, scale, scale);
        g.text(font, s, 0, 0, color, true);
        g.text(font, s, 1, 0, color, true);
        SoulGfx.pop(g);
    }

    public static int displayWidth(Font font, String s, float scale) {
        return (int) (font.width(s) * scale);
    }

    // ----------------------------------------------------------------- icons

    public static void icon(GuiGraphicsExtractor g, String[] mask, int x, int y, int scale, int color) {
        for (int row = 0; row < mask.length; row++) {
            String line = mask[row];
            for (int col = 0; col < line.length(); col++) {
                if (line.charAt(col) == '#') {
                    g.fill(x + col * scale, y + row * scale,
                            x + (col + 1) * scale, y + (row + 1) * scale, color);
                }
            }
        }
    }

    public static void iconCentered(GuiGraphicsExtractor g, String[] mask, int cx, int cy, int scale,
                                    int color) {
        int w = SoulIcons.maskWidth(mask) * scale;
        int h = SoulIcons.maskHeight(mask) * scale;
        icon(g, mask, cx - w / 2, cy - h / 2, scale, color);
    }
}
