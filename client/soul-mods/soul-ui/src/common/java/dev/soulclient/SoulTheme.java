package dev.soulclient;

/** Shared palette, metrics and motion tokens (no Minecraft imports). */
public final class SoulTheme {
    private SoulTheme() {
    }

    // Brand
    public static final int ACCENT = 0xFF5EEAD4;
    public static final int ACCENT_BRIGHT = 0xFF8FF7E6;
    public static final int ACCENT_DEEP = 0xFF2FB8A3;
    public static final int ACCENT_INK = 0xFF04211D;
    public static final int ACCENT_SOFT = 0x2E5EEAD4;
    public static final int ACCENT_HAZE = 0x165EEAD4;

    // Type
    public static final int TEXT = 0xFFF4F8FF;
    public static final int TEXT_DIM = 0xB8F4F8FF;
    public static final int TEXT_FAINT = 0x78F4F8FF;
    public static final int TEXT_ON_ACCENT = ACCENT_INK;
    public static final int OUTLINE = 0xD9070A0F;

    // Surfaces
    public static final int SCRIM = 0x8C05070B;
    public static final int WINDOW = 0xF20B0F16;
    public static final int WINDOW_SOFT = 0xE60E131B;
    public static final int SIDEBAR = 0xF2070A10;
    public static final int CARD = 0xF2161C26;
    public static final int CARD_HOVER = 0xFA1E2733;
    public static final int CARD_SUNKEN = 0xB30D1118;
    public static final int BUTTON = 0xF2161C26;
    public static final int BUTTON_HOVER = 0xFA202A38;
    public static final int GHOST = 0x8C11161E;
    public static final int GHOST_HOVER = 0xB3161C26;

    // Lines + light
    public static final int LINE = 0x1FFFFFFF;
    public static final int LINE_SOFT = 0x12FFFFFF;
    public static final int LINE_STRONG = 0x3DFFFFFF;
    public static final int GLOSS = 0x26FFFFFF;
    public static final int SHADOW = 0x66000000;
    public static final int SHADOW_SOFT = 0x38000000;

    // Radii (pixel grid)
    public static final int R_CHIP = 3;
    public static final int R_BUTTON = 6;
    public static final int R_CARD = 8;
    public static final int R_PANEL = 10;
    public static final int R_WINDOW = 12;

    // Motion (per second)
    public static final float HOVER_SPEED = 14f;
    public static final float PRESS_SPEED = 26f;
    public static final float ENTER_DURATION = 0.26f;
    public static final float STAGGER = 0.035f;

    public static float clamp01(float v) {
        return v < 0f ? 0f : Math.min(v, 1f);
    }

    public static float lerp(float a, float b, float t) {
        return a + (b - a) * t;
    }

    /** Frame-rate independent approach factor. */
    public static float approach(float current, float target, float speed, float dt) {
        float t = clamp01(speed * dt);
        return lerp(current, target, t);
    }

    public static float easeOut(float t) {
        t = clamp01(t);
        float inv = 1f - t;
        return 1f - inv * inv * inv;
    }

    public static float easeInOut(float t) {
        t = clamp01(t);
        return t < 0.5f ? 4f * t * t * t : 1f - (float) Math.pow(-2f * t + 2f, 3) / 2f;
    }

    /** Alpha channel of a packed ARGB colour. */
    public static int alpha(int color) {
        return (color >>> 24) & 0xFF;
    }

    public static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (clampByte(alpha) << 24);
    }

    public static int scaleAlpha(int color, float factor) {
        int a = (int) (alpha(color) * clamp01(factor));
        return (color & 0x00FFFFFF) | (clampByte(a) << 24);
    }

    public static int mix(int from, int to, float t) {
        t = clamp01(t);
        int a = (int) lerp(alpha(from), alpha(to), t);
        int r = (int) lerp((from >> 16) & 0xFF, (to >> 16) & 0xFF, t);
        int g = (int) lerp((from >> 8) & 0xFF, (to >> 8) & 0xFF, t);
        int b = (int) lerp(from & 0xFF, to & 0xFF, t);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private static int clampByte(int v) {
        return v < 0 ? 0 : Math.min(v, 255);
    }

    /**
     * Horizontal inset of a rounded rectangle for a scanline. Returns how many
     * pixels to shave from each side at row {@code y} (0-based from the top).
     */
    public static int insetForRow(int y, int height, int radius) {
        if (radius <= 0) {
            return 0;
        }
        int r = Math.min(radius, Math.min(height, 64) / 2);
        int top = y;
        int bottom = height - 1 - y;
        if (top >= r || bottom >= r) {
            return 0;
        }
        int d = Math.min(r - top, r - bottom);
        // quarter-circle: x inset = r - sqrt(r^2 - d^2)
        float inner = (float) (r - d);
        float v = r * r - inner * inner;
        int inset = (int) Math.ceil(r - Math.sqrt(Math.max(0f, v)));
        return Math.min(inset, r);
    }
}
