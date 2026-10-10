package dev.soulclient.ui;

import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

/**
 * Pixel-perfect UI painter: rounded panels, gradients, soft shadows, glows,
 * outlined/tracked type and pixel-art icons. Everything is built from 1px
 * fills + text so it behaves identically on every supported Minecraft.
 */
public final class SoulPaint {

    private SoulPaint() {
    }

    // ---------------------------------------------------------------- shapes

    public static void roundRect(DrawContext g, int x, int y, int w, int h, int radius, int color) {
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

    public static void roundRectOutline(DrawContext g, int x, int y, int w, int h, int radius, int color) {
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
                    // diagonal shoulder
                    int inner = Math.min(prevInset, inset);
                    int outer = Math.max(prevInset, inset);
                    g.fill(x + inner, y + row, x + outer, y + row + 1, color);
                    g.fill(x + w - outer, y + row, x + w - inner, y + row + 1, color);
                }
            }
            prevInset = inset;
        }
    }

    public static void rectOutline(DrawContext g, int x, int y, int w, int h, int color) {
        g.fill(x, y, x + w, y + 1, color);
        g.fill(x, y + h - 1, x + w, y + h, color);
        g.fill(x, y, x + 1, y + h, color);
        g.fill(x + w - 1, y, x + w, y + h, color);
    }

    public static void vGradient(DrawContext g, int x, int y, int w, int h, int top, int bottom) {
        if (h <= 0) {
            return;
        }
        for (int row = 0; row < h; row++) {
            g.fill(x, y + row, x + w, y + row + 1, SoulTheme.mix(top, bottom, (float) row / (h - 1)));
        }
    }

    public static void hGradient(DrawContext g, int x, int y, int w, int h, int left, int right) {
        if (w <= 0) {
            return;
        }
        for (int col = 0; col < w; col++) {
            g.fill(x + col, y, x + col + 1, y + h, SoulTheme.mix(left, right, (float) col / (w - 1)));
        }
    }

    /** Bottom-up scrim so text stays readable over any wallpaper. */
    public static void bottomScrim(DrawContext g, int w, int height, int strength) {
        int band = Math.min(height, Math.max(90, height / 3));
        for (int row = 0; row < band; row++) {
            float t = (float) row / band;
            int a = (int) (strength * t * t);
            if (a > 0) {
                g.fill(0, height - band + row, w, height - band + row + 1, (a << 24));
            }
        }
    }

    public static void leftScrim(DrawContext g, int height, int width, int strength) {
        for (int col = 0; col < width; col++) {
            float t = (float) col / width;
            int a = (int) (strength * (1f - t) * (1f - t));
            if (a > 0) {
                g.fill(col, 0, col + 1, height, (a << 24));
            }
        }
    }

    public static void topScrim(DrawContext g, int w, int height, int strength) {
        int band = Math.min(height, 96);
        for (int row = 0; row < band; row++) {
            float t = (float) row / band;
            int a = (int) (strength * (1f - t));
            if (a > 0) {
                g.fill(0, row, w, row + 1, (a << 24));
            }
        }
    }

    public static void shadow(DrawContext g, int x, int y, int w, int h, int radius, int spread, int color) {
        for (int layer = spread; layer >= 1; layer--) {
            float t = (float) layer / spread;
            int a = (int) (SoulTheme.alpha(color) * (1f - t) * 0.55f);
            if (a <= 0) {
                continue;
            }
            int c = (a << 24) | (color & 0x00FFFFFF);
            roundRect(g, x - layer, y - layer + 2, w + layer * 2, h + layer * 2, radius + layer, c);
        }
    }

    public static void glow(DrawContext g, int x, int y, int w, int h, int radius, int color, int layers) {
        for (int layer = layers; layer >= 1; layer--) {
            float t = 1f - (float) layer / (layers + 1f);
            int a = (int) (SoulTheme.alpha(color) * t * 0.5f);
            if (a <= 0) {
                continue;
            }
            int c = (a << 24) | (color & 0x00FFFFFF);
            roundRectOutline(g, x - layer, y - layer, w + layer * 2, h + layer * 2, radius + layer, c);
        }
    }

    public static void accentGlow(DrawContext g, int x, int y, int w, int h, int radius, float strength) {
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

    public static void pill(DrawContext g, int x, int y, int w, int h, int color) {
        roundRect(g, x, y, w, h, h / 2, color);
    }

    public static void pillOutline(DrawContext g, int x, int y, int w, int h, int color) {
        for (int row = 0; row < h; row++) {
            int inset = SoulTheme.insetForRow(row, h, h / 2);
            g.fill(x + inset, y + row, x + w - inset, y + row + 1, color);
        }
        g.fill(x + 1, y, x + w - 1, y + 1, color);
        g.fill(x + 1, y + h - 1, x + w - 1, y + h, color);
    }

    public static void divider(DrawContext g, int x, int y, int w, int color) {
        g.fill(x, y, x + w, y + 1, color);
    }

    // ------------------------------------------------------------------ type

    public static void text(DrawContext g, TextRenderer font, String s, int x, int y, int color) {
        g.drawTextWithShadow(font, s, x, y, color);
    }

    public static void textCentered(DrawContext g, TextRenderer font, String s, int cx, int y, int color) {
        g.drawCenteredTextWithShadow(font, s, cx, y, color);
    }

    /** Faux-bold: the stock font has no bold weight, so double-strike it. */
    public static void bold(DrawContext g, TextRenderer font, String s, int x, int y, int color) {
        g.drawTextWithShadow(font, s, x, y, color);
        g.drawTextWithShadow(font, s, x + 1, y, color);
    }

    public static void boldCentered(DrawContext g, TextRenderer font, String s, int cx, int y, int color) {
        bold(g, font, s, cx - font.getWidth(s) / 2, y, color);
    }

    /** 1px outline pass, then the glyphs on top. */
    public static void outlined(DrawContext g, TextRenderer font, String s, int x, int y, int fill, int outline) {
        g.drawTextWithShadow(font, s, x - 1, y, outline);
        g.drawTextWithShadow(font, s, x + 1, y, outline);
        g.drawTextWithShadow(font, s, x, y - 1, outline);
        g.drawTextWithShadow(font, s, x, y + 1, outline);
        g.drawTextWithShadow(font, s, x, y, fill);
    }

    public static void outlinedCentered(DrawContext g, TextRenderer font, String s, int cx, int y,
                                        int fill, int outline) {
        outlined(g, font, s, cx - font.getWidth(s) / 2, y, fill, outline);
    }

    /** Uppercase micro-label with +1px tracking. */
    public static int tracked(DrawContext g, TextRenderer font, String s, int x, int y, int color) {
        int cx = x;
        for (int i = 0; i < s.length(); i++) {
            String ch = s.substring(i, i + 1);
            g.drawTextWithShadow(font, ch, cx, y, color);
            cx += font.getWidth(ch) + 1;
        }
        return cx - x - 1;
    }

    public static int trackedWidth(TextRenderer font, String s) {
        int w = 0;
        for (int i = 0; i < s.length(); i++) {
            w += font.getWidth(s.substring(i, i + 1)) + 1;
        }
        return Math.max(0, w - 1);
    }

    public static void trackedCentered(DrawContext g, TextRenderer font, String s, int cx, int y, int color) {
        tracked(g, font, s, cx - trackedWidth(font, s) / 2, y, color);
    }

    /** Large display type: scaled, faux-bold, with an accent underline. */
    public static void display(DrawContext g, TextRenderer font, String s, int x, int y, float scale, int color) {
        SoulGfx.push(g);
        SoulGfx.translate(g, x + 1, y + 1);
        SoulGfx.scale(g, scale, scale);
        g.drawTextWithShadow(font, s, 0, 0, SoulTheme.SHADOW);
        SoulGfx.pop(g);
        SoulGfx.push(g);
        SoulGfx.translate(g, x, y);
        SoulGfx.scale(g, scale, scale);
        g.drawTextWithShadow(font, s, 0, 0, color);
        g.drawTextWithShadow(font, s, 1, 0, color);
        SoulGfx.pop(g);
    }

    public static int displayWidth(TextRenderer font, String s, float scale) {
        return (int) (font.getWidth(s) * scale);
    }

    // ----------------------------------------------------------------- icons

    public static void icon(DrawContext g, String[] mask, int x, int y, int scale, int color) {
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

    public static void iconCentered(DrawContext g, String[] mask, int cx, int cy, int scale, int color) {
        int w = SoulIcons.maskWidth(mask) * scale;
        int h = SoulIcons.maskHeight(mask) * scale;
        icon(g, mask, cx - w / 2, cy - h / 2, scale, color);
    }
}
