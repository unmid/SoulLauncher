package dev.soulclient.ui;

import dev.soulclient.SoulTheme;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

/**
 * Animated button skin. The widget underneath keeps all input, focus and
 * narration behaviour; everything visual (fill, border, label, icon, glow,
 * entrance offset) is drawn after the widget pass from interpolated state, so
 * the UI feels alive instead of static.
 */
public final class SoulSkin {

    public static final int PRIMARY = 0;
    public static final int SECONDARY = 1;
    public static final int GHOST = 2;
    public static final int SIDEBAR = 3;
    public static final int TILE = 4;
    public static final int ROW = 5;
    /** Compact ON/OFF pill — the label carries the state, not the caption. */
    public static final int STATE = 6;

    private SoulSkin() {
    }

    public static final class Skin {
        final ButtonWidget button;
        final int x;
        final int y;
        final int w;
        final int h;
        String label;
        final int style;
        final String[] icon;
        final int radius;
        final float order;
        final String sublabel;

        float hover;
        float press;
        float appear;
        boolean entered;

        Skin(ButtonWidget button, int x, int y, int w, int h, String label, String sublabel,
             int style, String[] icon, int radius, float order) {
            this.button = button;
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.label = label;
            this.sublabel = sublabel;
            this.style = style;
            this.icon = icon;
            this.radius = radius;
            this.order = order;
        }

        public ButtonWidget button() {
            return button;
        }

        /** Swaps the drawn caption and keeps the narrated message in step. */
        public void label(String text) {
            this.label = text;
            button.setMessage(Text.literal(text));
        }

        void update(float dt, double mouseX, double mouseY) {
            if (!entered) {
                appear = Math.min(1f, appear + dt / SoulTheme.ENTER_DURATION);
                if (appear >= 1f) {
                    entered = true;
                }
            }
            // The skin slides in from below while the widget's hitbox stays
            // put, so it only accepts input once the two coincide.
            boolean settled = entrance() >= 0.985f;
            if (settled != button.active) {
                button.active = settled;
            }
            // The widget is registered for input only, so it is never rendered
            // by vanilla and never gets a hover update from it — hit-test here.
            boolean hovered = button.visible && button.active
                    && mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h;
            hover = SoulTheme.approach(hover, hovered ? 1f : 0f, SoulTheme.HOVER_SPEED, dt);
            boolean down = hovered && SoulMc.mouseDown();
            press = SoulTheme.approach(press, down ? 1f : 0f, SoulTheme.PRESS_SPEED, dt);
        }

        float entrance() {
            float delay = order * SoulTheme.STAGGER;
            return SoulTheme.easeOut(SoulTheme.clamp01((appear - delay) / Math.max(0.01f, 1f - delay)));
        }
    }

    public static Skin build(String label, int x, int y, int w, int h, int style, String[] icon,
                             int radius, float order, ButtonWidget.PressAction onPress) {
        return build(label, null, x, y, w, h, style, icon, radius, order, onPress);
    }

    public static Skin build(String label, String sublabel, int x, int y, int w, int h, int style,
                             String[] icon, int radius, float order, ButtonWidget.PressAction onPress) {
        ButtonWidget button = ButtonWidget.builder(Text.literal(label), onPress)
                .dimensions(x, y, w, h).build();
        return new Skin(button, x, y, w, h, label, sublabel, style, icon, radius, order);
    }

    public static void draw(DrawContext g, TextRenderer font, Skin s, float dt,
                            double mouseX, double mouseY) {
        s.update(dt, mouseX, mouseY);
        if (!s.button.visible) {
            return;
        }
        float enter = s.entrance();
        if (enter <= 0.004f) {
            return;
        }
        float hover = s.hover;
        float press = s.press;
        int x = s.x;
        int y = s.y + (int) ((1f - enter) * 12f) + (int) (press * 1f);
        int w = s.w;
        int h = s.h;
        int r = s.radius;
        int a = (int) (255f * enter);

        int bg;
        int border;
        int labelColor;
        int iconColor;

        switch (s.style) {
            case PRIMARY -> {
                bg = SoulTheme.mix(SoulTheme.ACCENT, SoulTheme.ACCENT_BRIGHT, hover * 0.75f);
                border = SoulTheme.mix(SoulTheme.ACCENT_DEEP, SoulTheme.ACCENT_BRIGHT, hover);
                labelColor = SoulTheme.TEXT_ON_ACCENT;
                iconColor = SoulTheme.TEXT_ON_ACCENT;
                SoulPaint.accentGlow(g, x, y, w, h, r, (0.35f + hover * 0.65f) * enter);
            }
            case SIDEBAR -> {
                bg = SoulTheme.mix(0x00000000, SoulTheme.ACCENT_SOFT, hover);
                border = 0x00FFFFFF;
                labelColor = SoulTheme.mix(SoulTheme.TEXT_DIM, SoulTheme.TEXT, hover);
                iconColor = SoulTheme.mix(SoulTheme.TEXT_FAINT, SoulTheme.ACCENT, hover);
            }
            case TILE -> {
                bg = SoulTheme.mix(SoulTheme.CARD, SoulTheme.CARD_HOVER, hover);
                border = SoulTheme.mix(SoulTheme.LINE, SoulTheme.ACCENT, hover * 0.75f);
                labelColor = SoulTheme.TEXT;
                iconColor = SoulTheme.mix(SoulTheme.TEXT_FAINT, SoulTheme.ACCENT, hover);
            }
            case ROW -> {
                bg = SoulTheme.mix(0x00000000, SoulTheme.CARD_HOVER, hover);
                border = 0x00FFFFFF;
                labelColor = SoulTheme.TEXT;
                iconColor = SoulTheme.mix(SoulTheme.TEXT_FAINT, SoulTheme.ACCENT, hover);
            }
            case GHOST -> {
                bg = SoulTheme.mix(SoulTheme.GHOST, SoulTheme.GHOST_HOVER, hover);
                border = SoulTheme.mix(SoulTheme.LINE_SOFT, SoulTheme.ACCENT, hover);
                labelColor = SoulTheme.mix(SoulTheme.TEXT_DIM, SoulTheme.TEXT, hover);
                iconColor = SoulTheme.mix(SoulTheme.TEXT_FAINT, SoulTheme.ACCENT, hover);
            }
            case STATE -> {
                boolean on = "ON".equalsIgnoreCase(s.label);
                bg = on ? SoulTheme.ACCENT : SoulTheme.mix(SoulTheme.GHOST, SoulTheme.GHOST_HOVER, hover);
                border = on ? SoulTheme.ACCENT_BRIGHT : SoulTheme.mix(SoulTheme.LINE, SoulTheme.ACCENT, hover);
                labelColor = on ? SoulTheme.TEXT_ON_ACCENT : SoulTheme.mix(SoulTheme.TEXT_DIM, SoulTheme.TEXT, hover);
                iconColor = labelColor;
                if (on) {
                    SoulPaint.accentGlow(g, x, y, w, h, r, (0.3f + hover * 0.4f) * enter);
                }
            }
            default -> {
                bg = SoulTheme.mix(SoulTheme.BUTTON, SoulTheme.BUTTON_HOVER, hover);
                border = SoulTheme.mix(SoulTheme.LINE, SoulTheme.ACCENT, hover * 0.9f);
                labelColor = SoulTheme.TEXT;
                iconColor = SoulTheme.mix(SoulTheme.TEXT_FAINT, SoulTheme.ACCENT, hover);
            }
        }

        if (s.style == PRIMARY) {
            SoulPaint.shadow(g, x, y, w, h, r, 3, SoulTheme.scaleAlpha(SoulTheme.SHADOW, 0.75f * enter));
        }
        SoulPaint.roundRect(g, x, y, w, h, r, SoulTheme.scaleAlpha(bg, a / 255f));
        if (s.style == SECONDARY && hover > 0.02f) {
            g.fill(x + 1, y + 3, x + 3, y + h - 3, SoulTheme.scaleAlpha(SoulTheme.ACCENT, hover));
        }
        SoulPaint.roundRectOutline(g, x, y, w, h, r, SoulTheme.scaleAlpha(border, a / 255f));
        if (s.style == PRIMARY) {
            SoulPaint.roundRect(g, x + 1, y + 1, w - 2, Math.max(1, h / 3), Math.max(1, r - 1),
                    SoulTheme.scaleAlpha(SoulTheme.GLOSS, 0.4f * enter));
        }
        if (s.button.isFocused()) {
            SoulPaint.roundRectOutline(g, x - 2, y - 2, w + 4, h + 4, r + 2,
                    SoulTheme.withAlpha(SoulTheme.ACCENT, (int) (190 * enter)));
        }

        int contentX = x + 12;
        int iconSize = 0;
        if (s.icon != null) {
            iconSize = s.icon[0].length();
            int iconY = y + (h - s.icon.length) / 2 + 1;
            SoulPaint.icon(g, s.icon, contentX, iconY, 1, SoulTheme.scaleAlpha(iconColor, a / 255f));
            contentX += iconSize + 9;
        }
        int textY = s.sublabel != null ? y + h / 2 - 8 : y + (h - 8) / 2;
        if (s.style == STATE) {
            SoulPaint.textCentered(g, font, s.label, x + w / 2, textY,
                    SoulTheme.scaleAlpha(labelColor, a / 255f));
        } else if (s.style == PRIMARY) {
            SoulPaint.bold(g, font, s.label, contentX, textY, SoulTheme.scaleAlpha(labelColor, a / 255f));
        } else {
            SoulPaint.text(g, font, s.label, contentX, textY, SoulTheme.scaleAlpha(labelColor, a / 255f));
        }
        if (s.sublabel != null) {
            SoulPaint.text(g, font, s.sublabel, contentX, textY + 11,
                    SoulTheme.scaleAlpha(SoulTheme.TEXT_FAINT, a / 255f));
        }
    }
}
