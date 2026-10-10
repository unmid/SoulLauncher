package dev.soulclient.ui;

import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.option.GameOptions;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;

/**
 * Soul settings — the options screen rebuilt in the client's own language:
 * sidebar categories, dense rows, custom sliders and switches, and not a
 * single vanilla widget drawn on screen. Sliders own their input through the
 * vanilla widget pipeline (so dragging and keyboard stepping stay correct);
 * switches are plain Soul skins registered for input only.
 */
public class SoulSettingsScreen extends Screen {

    private static final String[][] TAB_ICONS = {
            SoulIcons.SLIDERS, SoulIcons.GRID, SoulIcons.GEAR
    };
    private static final String[] TAB_LABELS = {"Video", "Audio", "Gameplay"};
    private static final String[] TAB_SUBTITLES = {
            "Graphics & display", "Volumes", "Feel & world"
    };

    private static final int ROW_H_MAX = 40;
    private static final int ROW_GAP = 6;
    private static final int SLIDER_H = 16;
    private static final int CONTROL_W = 210;
    private static final int TOGGLE_W = 74;
    private static final int TOGGLE_H = 24;
    private static final int MAX_ROWS = 5;
    private static final int HEADER_H = 66;
    private static final int FOOTER_H = 58;

    private final Screen parent;
    private final List<SoulSkin.Skin> sidebar = new ArrayList<>();
    private final List<SoulSkin.Skin> toggles = new ArrayList<>();
    private final List<SoulSkin.Skin> footer = new ArrayList<>();
    private final List<Row> rows = new ArrayList<>();

    private int[] rowCounts;
    private int tab;
    private float indicatorY;

    private int winX;
    private int winY;
    private int winW;
    private int winH;
    private int sideW;
    private int contentX;
    private int contentW;
    private int controlW;
    private int rowsTop;
    private int rowH;
    private int footerTop;

    private static final class Row {
        final int tab;
        final String label;
        final SoulSlider slider;
        final SoulSkin.Skin toggle;
        final BooleanSupplier get;
        final Consumer<Boolean> set;
        final double resetAmount;
        final boolean resetOn;
        final int y;

        Row(int tab, String label, SoulSlider slider, SoulSkin.Skin toggle,
            BooleanSupplier get, Consumer<Boolean> set, double resetAmount, boolean resetOn, int y) {
            this.tab = tab;
            this.label = label;
            this.slider = slider;
            this.toggle = toggle;
            this.get = get;
            this.set = set;
            this.resetAmount = resetAmount;
            this.resetOn = resetOn;
            this.y = y;
        }
    }

    public SoulSettingsScreen(Screen parent) {
        super(Text.literal("SOUL SETTINGS"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        MinecraftClient client = MinecraftClient.getInstance();
        GameOptions opts = client.options;
        sidebar.clear();
        toggles.clear();
        footer.clear();
        rows.clear();
        rowCounts = new int[TAB_LABELS.length];

        winW = Math.min(680, Math.max(240, this.width - 24));
        winH = Math.min(HEADER_H + MAX_ROWS * (ROW_H_MAX + ROW_GAP) - ROW_GAP + FOOTER_H,
                this.height - 16);
        winH = Math.max(160, winH);
        winX = (this.width - winW) / 2;
        winY = (this.height - winH) / 2;
        sideW = Math.min(156, Math.max(96, winW / 4));
        contentX = winX + sideW + 24;
        contentW = Math.max(60, winW - sideW - 48);
        controlW = Math.min(CONTROL_W, Math.max(88, contentW - 170));
        controlW = Math.max(48, Math.min(controlW, contentW - 64));
        rowH = Math.max(26, Math.min(ROW_H_MAX,
                (winH - HEADER_H - FOOTER_H - (MAX_ROWS - 1) * ROW_GAP) / MAX_ROWS));
        rowsTop = winY + HEADER_H;
        footerTop = winY + winH - FOOTER_H;

        // Sidebar categories
        int tabY = rowsTop;
        for (int i = 0; i < TAB_LABELS.length; i++) {
            int index = i;
            SoulSkin.Skin s = SoulSkin.build(TAB_LABELS[i], null,
                    winX + 12, tabY + i * 38, sideW - 24, 32, SoulSkin.SIDEBAR,
                    TAB_ICONS[i], SoulTheme.R_BUTTON, i * 0.4f, b -> setTab(index));
            addSelectableChild(s.button());
            sidebar.add(s);
        }
        indicatorY = tabY;

        buildRows(opts);

        // Footer actions — Controls joins the row only when there is room.
        int btnY = footerTop + 12;
        int doneW = Math.min(140, Math.max(80, contentW / 3));
        int resetW = contentW >= 300 ? 110 : 0;
        int ctrlW = contentW - doneW - resetW - (resetW > 0 ? 16 : 8);
        if (resetW > 0) {
            addFooter("Reset", SoulSkin.GHOST, null, contentX, btnY, resetW, 3.2f, b -> resetTab());
        }
        if (ctrlW >= 96) {
            int ctrlX = contentX + (resetW > 0 ? resetW + 8 : 0);
            addFooter("Controls", SoulSkin.GHOST, null, ctrlX, btnY, Math.min(130, ctrlW), 3.3f,
                    b -> client.setScreen(new SoulKeybindScreen(this)));
        }
        addFooter("Done", SoulSkin.PRIMARY, SoulIcons.CHECK,
                contentX + contentW - doneW, btnY, doneW, 3.4f, b -> close());

        applyTab();
    }

    private void addFooter(String label, int style, String[] icon, int x, int y, int w,
                           float order, net.minecraft.client.gui.widget.ButtonWidget.PressAction onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, null, x, y, w, 32, style, icon,
                SoulTheme.R_BUTTON, order, onPress);
        addSelectableChild(s.button());
        footer.add(s);
    }

    // ---------------------------------------------------------------- rows

    private int nextRowY(int rowTab) {
        int index = rowCounts[rowTab]++;
        return rowsTop + index * (rowH + ROW_GAP);
    }

    private void addSlider(int rowTab, String label, double min, double max, double start,
                           boolean integer, DoubleFunction<String> format,
                           DoubleConsumer apply, double reset) {
        int y = nextRowY(rowTab);
        SoulSlider s = new SoulSlider(label, min, max, start, integer, format, apply,
                contentX + contentW - controlW, y + (rowH - SLIDER_H) / 2, controlW, SLIDER_H);
        addDrawableChild(s);
        rows.add(new Row(rowTab, label, s, null, null, null, reset, false, y));
    }

    private void addToggle(int rowTab, String label, BooleanSupplier get, Consumer<Boolean> set,
                           boolean reset) {
        int y = nextRowY(rowTab);
        SoulSkin.Skin[] holder = new SoulSkin.Skin[1];
        holder[0] = SoulSkin.build(get.getAsBoolean() ? "ON" : "OFF", null,
                contentX + contentW - TOGGLE_W, y + (rowH - TOGGLE_H) / 2, TOGGLE_W, TOGGLE_H,
                SoulSkin.STATE, null, SoulTheme.R_BUTTON, 0f, b -> {
                    boolean next = !get.getAsBoolean();
                    set.accept(next);
                    holder[0].label(next ? "ON" : "OFF");
                });
        addSelectableChild(holder[0].button());
        toggles.add(holder[0]);
        rows.add(new Row(rowTab, label, null, holder[0], get, set, 0, reset, y));
    }

    private void buildRows(GameOptions opts) {
        DoubleFunction<String> percent = v -> Math.round(v * 100) + "%";

        // Video
        addSlider(0, "Field of View", 30, 110, opts.getFov().getValue(), true,
                v -> Math.round(v) + "",
                v -> opts.getFov().setValue((int) Math.round(v)), 70);
        addSlider(0, "Brightness", 0, 1, opts.getGamma().getValue(), false, percent,
                v -> opts.getGamma().setValue(v), 0);
        addSlider(0, "Render Distance", 2, 32, opts.getViewDistance().getValue(), true,
                v -> Math.round(v) + " chunks",
                v -> opts.getViewDistance().setValue((int) Math.round(v)), 8);
        addSlider(0, "Max Framerate", 30, 260, opts.getMaxFps().getValue(), true,
                v -> v >= 260 ? "Unlimited" : Math.round(v) + " FPS",
                v -> opts.getMaxFps().setValue((int) Math.round(v)), 120);
        addToggle(0, "VSync",
                opts.getEnableVsync()::getValue, opts.getEnableVsync()::setValue, true);

        // Audio
        addSlider(1, "Master Volume", 0, 1,
                opts.getSoundVolumeOption(SoundCategory.MASTER).getValue(), false, percent,
                v -> opts.getSoundVolumeOption(SoundCategory.MASTER).setValue(v), 1);
        addSlider(1, "Music", 0, 1,
                opts.getSoundVolumeOption(SoundCategory.MUSIC).getValue(), false, percent,
                v -> opts.getSoundVolumeOption(SoundCategory.MUSIC).setValue(v), 1);
        addSlider(1, "Players", 0, 1,
                opts.getSoundVolumeOption(SoundCategory.PLAYERS).getValue(), false, percent,
                v -> opts.getSoundVolumeOption(SoundCategory.PLAYERS).setValue(v), 1);
        addSlider(1, "Ambient", 0, 1,
                opts.getSoundVolumeOption(SoundCategory.AMBIENT).getValue(), false, percent,
                v -> opts.getSoundVolumeOption(SoundCategory.AMBIENT).setValue(v), 1);
        addSlider(1, "Weather", 0, 1,
                opts.getSoundVolumeOption(SoundCategory.WEATHER).getValue(), false, percent,
                v -> opts.getSoundVolumeOption(SoundCategory.WEATHER).setValue(v), 1);

        // Gameplay
        addToggle(2, "Auto Jump", opts.getAutoJump()::getValue, opts.getAutoJump()::setValue, false);
        addToggle(2, "View Bobbing", opts.getBobView()::getValue, opts.getBobView()::setValue, true);
        addToggle(2, "Entity Shadows",
                opts.getEntityShadows()::getValue, opts.getEntityShadows()::setValue, true);
        addToggle(2, "Fullscreen", opts.getFullscreen()::getValue, v -> {
            opts.getFullscreen().setValue(v);
            SoulMc.applyFullscreen(v);
        }, false);
        addToggle(2, "Invert Mouse", SoulMc.invertY()::getValue, SoulMc.invertY()::setValue, false);
    }

    private void setTab(int index) {
        tab = index;
        applyTab();
    }

    private void applyTab() {
        for (SoulSkin.Skin s : sidebar) {
            s.button.visible = true;
        }
        for (Row r : rows) {
            boolean show = r.tab == tab && r.y + rowH <= footerTop - 4;
            if (r.slider != null) {
                r.slider.visible = show;
            }
            if (r.toggle != null) {
                r.toggle.button.visible = show;
            }
        }
    }

    private void resetTab() {
        for (Row r : rows) {
            if (r.tab != tab) {
                continue;
            }
            if (r.slider != null) {
                r.slider.setAmount(r.resetAmount);
            } else if (r.toggle != null) {
                r.set.accept(r.resetOn);
                r.toggle.label(r.resetOn ? "ON" : "OFF");
            }
        }
    }

    @Override
    public void close() {
        MinecraftClient client = MinecraftClient.getInstance();
        client.options.write();
        if (parent != null) {
            client.setScreen(parent);
        } else {
            client.setScreen(null);
        }
    }

    // -------------------------------------------------------------- render

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        float dt = Math.min(delta, 0.1f);
        this.renderBackground(ctx, mouseX, mouseY, delta);
        ctx.fill(0, 0, this.width, this.height, 0x8005070B);

        // Window chrome
        SoulPaint.shadow(ctx, winX, winY, winW, winH, SoulTheme.R_WINDOW, 7, 0xB8000000);
        SoulPaint.roundRect(ctx, winX, winY, winW, winH, SoulTheme.R_WINDOW, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(ctx, winX, winY, winW, winH, SoulTheme.R_WINDOW, SoulTheme.LINE_STRONG);
        SoulPaint.roundRect(ctx, winX + 1, winY + 1, winW - 2, 1, 1, SoulTheme.GLOSS);

        // Sidebar column
        SoulPaint.roundRect(ctx, winX + 1, winY + 1, sideW, winH - 2, SoulTheme.R_WINDOW, SoulTheme.SIDEBAR);
        ctx.fill(winX + sideW - SoulTheme.R_WINDOW, winY + 1, winX + sideW, winY + winH - 1,
                SoulTheme.SIDEBAR);
        ctx.fill(winX + sideW, winY + SoulTheme.R_WINDOW, winX + sideW + 1, winY + winH - SoulTheme.R_WINDOW,
                SoulTheme.LINE_SOFT);

        SoulTex.logo(ctx, winX + 20, winY + 18, 24);
        SoulPaint.tracked(ctx, this.textRenderer, "SOUL", winX + 52, winY + 26, SoulTheme.TEXT);
        SoulPaint.divider(ctx, winX + 16, winY + 54, sideW - 32, SoulTheme.LINE_SOFT);

        if (winH - 26 > 180 + 6) {
            String user = SoulMc.username();
            int uw = this.textRenderer.getWidth(user);
            SoulPaint.pill(ctx, winX + sideW - uw - 30, winY + winH - 26, uw + 22, 18, SoulTheme.CARD);
            SoulPaint.text(ctx, this.textRenderer, user, winX + sideW - uw - 19, winY + winH - 22,
                    SoulTheme.TEXT_FAINT);
        }

        // Sliding tab indicator
        float targetY = rowsTop + tab * 38 + 5;
        indicatorY = SoulTheme.approach(indicatorY, targetY, 16f, dt);
        ctx.fill(winX + 12, (int) indicatorY, winX + 14, (int) indicatorY + 22, SoulTheme.ACCENT);
        SoulPaint.accentGlow(ctx, winX + 12, (int) indicatorY, 2, 22, 1, 0.7f);

        // Header
        SoulPaint.display(ctx, this.textRenderer, "SETTINGS", contentX, winY + 24, 1.6f, SoulTheme.TEXT);
        SoulPaint.tracked(ctx, this.textRenderer, TAB_SUBTITLES[tab].toUpperCase(),
                contentX + SoulPaint.displayWidth(this.textRenderer, "SETTINGS", 1.6f) + 12,
                winY + 30, SoulTheme.TEXT_FAINT);
        SoulPaint.divider(ctx, contentX, winY + 54, contentW, SoulTheme.LINE_SOFT);

        drawRows(ctx, mouseX, mouseY);

        SoulPaint.divider(ctx, contentX, footerTop + 2, contentW, SoulTheme.LINE_SOFT);

        super.render(ctx, mouseX, mouseY, delta);

        for (SoulSkin.Skin s : sidebar) {
            SoulSkin.draw(ctx, this.textRenderer, s, dt, mouseX, mouseY);
        }
        for (SoulSkin.Skin s : toggles) {
            SoulSkin.draw(ctx, this.textRenderer, s, dt, mouseX, mouseY);
        }
        for (SoulSkin.Skin s : footer) {
            SoulSkin.draw(ctx, this.textRenderer, s, dt, mouseX, mouseY);
        }
    }

    private void drawRows(DrawContext ctx, int mouseX, int mouseY) {
        int rx = contentX - 4;
        int rw = contentW + 8;
        int labelY = 0;
        for (Row r : rows) {
            if (r.tab != tab || r.y + rowH > footerTop - 4) {
                continue;
            }
            boolean hover = mouseX >= rx && mouseX < rx + rw
                    && mouseY >= r.y && mouseY < r.y + rowH;
            labelY = r.y + (rowH - 8) / 2;

            if (hover) {
                SoulPaint.roundRect(ctx, rx, r.y, rw, rowH, SoulTheme.R_CARD,
                        SoulTheme.scaleAlpha(SoulTheme.CARD_HOVER, 0.7f));
                ctx.fill(rx + 1, r.y + 6, rx + 3, r.y + rowH - 6, SoulTheme.ACCENT);
            }
            SoulPaint.divider(ctx, contentX, r.y + rowH + ROW_GAP / 2 - 1, contentW, SoulTheme.LINE_SOFT);

            SoulPaint.text(ctx, this.textRenderer, r.label, contentX + 12, labelY,
                    hover ? SoulTheme.TEXT : SoulTheme.TEXT_DIM);

            if (r.slider != null) {
                String value = r.slider.valueText();
                int vw = this.textRenderer.getWidth(value);
                int vx = contentX + contentW - controlW - 12 - vw;
                // Narrow layouts drop the caption rather than stack two strings.
                if (vx > contentX + 12 + this.textRenderer.getWidth(r.label) + 8) {
                    SoulPaint.text(ctx, this.textRenderer, value, vx, labelY,
                            hover ? SoulTheme.ACCENT : SoulTheme.TEXT_FAINT);
                }
            }
        }
    }
}
