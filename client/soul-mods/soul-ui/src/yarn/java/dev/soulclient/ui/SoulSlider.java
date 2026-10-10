package dev.soulclient.ui;

import dev.soulclient.SoulTheme;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;

import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;

/**
 * Soul slider. Vanilla keeps ownership of dragging, keyboard stepping,
 * hit-testing and focus; every pixel is ours. The track holds a normalised
 * 0..1 value which the screen maps onto a real option range through
 * {@code format} (what the player reads) and {@code apply} (what gets saved).
 * The value caption itself is painted by the owning row, so this widget only
 * draws the rail, the fill and the thumb.
 */
public class SoulSlider extends SliderWidget {

    private final String label;
    private final double min;
    private final double max;
    private final boolean integer;
    private final DoubleFunction<String> format;
    private final DoubleConsumer apply;

    public SoulSlider(String label, double min, double max, double start, boolean integer,
                      DoubleFunction<String> format, DoubleConsumer apply,
                      int x, int y, int w, int h) {
        super(x, y, w, h, Text.literal(label), normalize(start, min, max));
        this.label = label;
        this.min = min;
        this.max = max;
        this.integer = integer;
        this.format = format;
        this.apply = apply;
        updateMessage();
    }

    private static double normalize(double v, double min, double max) {
        if (max <= min) {
            return 0d;
        }
        double t = (v - min) / (max - min);
        return t < 0d ? 0d : Math.min(1d, t);
    }

    /** Current value in option units (rounded when the option is integral). */
    public double amount() {
        double raw = min + value * (max - min);
        return integer ? Math.round(raw) : raw;
    }

    /** Pushes a value into the track and into the option behind it (reset). */
    public void setAmount(double v) {
        value = normalize(v, min, max);
        updateMessage();
        applyValue();
    }

    /** What the player reads on the row: e.g. "12 chunks", "100%", "70". */
    public String valueText() {
        return format.apply(amount());
    }

    @Override
    protected void updateMessage() {
        setMessage(Text.literal(label + ": " + valueText()));
    }

    @Override
    protected void applyValue() {
        apply.accept(amount());
    }

    @Override
    public void renderWidget(DrawContext g, int mouseX, int mouseY, float delta) {
        int x = getX();
        int y = getY();
        int w = getWidth();
        int h = getHeight();
        boolean hover = isHovered() && active;
        float shine = hover ? 1f : 0f;
        float lit = active ? 1f : 0.4f;

        int railH = 6;
        int railY = y + (h - railH) / 2;
        int thumb = 14;
        int thumbY = y + (h - thumb) / 2;

        // Rail
        SoulPaint.roundRect(g, x, railY, w, railH, railH / 2,
                SoulTheme.mix(SoulTheme.CARD_SUNKEN, SoulTheme.CARD, shine * 0.5f));
        SoulPaint.roundRectOutline(g, x, railY, w, railH, railH / 2,
                SoulTheme.scaleAlpha(SoulTheme.LINE_SOFT, lit));

        // Fill up to the thumb centre
        int travel = w - thumb;
        int fill = (int) Math.round(travel * value) + thumb / 2;
        if (fill > 0) {
            SoulPaint.roundRect(g, x, railY, Math.min(fill, w), railH, railH / 2,
                    SoulTheme.scaleAlpha(
                            SoulTheme.mix(SoulTheme.ACCENT_DEEP, SoulTheme.ACCENT, shine), lit));
        }

        // Thumb
        int tx = x + (int) Math.round(travel * value);
        if (hover || active) {
            SoulPaint.accentGlow(g, tx, thumbY, thumb, thumb, thumb / 2,
                    (0.25f + 0.35f * shine) * lit);
        }
        SoulPaint.roundRect(g, tx, thumbY, thumb, thumb, thumb / 2,
                SoulTheme.scaleAlpha(SoulTheme.mix(SoulTheme.TEXT, SoulTheme.ACCENT_BRIGHT, shine), lit));
        SoulPaint.roundRectOutline(g, tx, thumbY, thumb, thumb, thumb / 2,
                SoulTheme.scaleAlpha(SoulTheme.mix(SoulTheme.ACCENT_DEEP, SoulTheme.ACCENT, shine), lit));

        if (isFocused()) {
            SoulPaint.roundRectOutline(g, x - 3, y - 2, w + 6, h + 4, SoulTheme.R_CHIP,
                    SoulTheme.withAlpha(SoulTheme.ACCENT, 150));
        }
    }
}
