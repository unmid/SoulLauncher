package dev.soulclient.ui;

import dev.soulclient.SoulBridge;
import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/** Soul Menu app shell (Minecraft 26.1+, official names). */
public class SoulMenuScreen extends Screen {

    private static final String[][] TAB_ICONS = {
            SoulIcons.GRID, SoulIcons.EYES, SoulIcons.CUBE, SoulIcons.GEAR
    };
    private static final String[] TAB_LABELS = {"Dashboard", "HUD", "Mods", "Settings"};
    private static final String[] TAB_SUBTITLES = {
            "Welcome back", "On-screen overlay", "Installed content", "Preferences"
    };

    private final Screen parent;
    private final List<SoulSkin.Skin> sidebar = new ArrayList<>();
    private final List<SoulSkin.Skin> content = new ArrayList<>();
    private int tab;
    private float indicatorY;
    private float openTime;
    private boolean hudOn;
    private boolean hudInstalled;
    // Tiles whose caption flips to "Copied!" after a clipboard press.
    private SoulSkin.Skin accountTile;
    private SoulSkin.Skin gameTile;
    private SoulSkin.Skin readoutsTile;
    private SoulSkin.Skin aboutTile;
    private SoulSkin.Skin flashed;
    private String flashedOriginal;
    private long flashedAt;

    private int winX;
    private int winY;
    private int winW;
    private int winH;
    private int sideW;
    private int contentX;
    private int contentW;

    public SoulMenuScreen(Screen parent) {
        super(Minecraft.getInstance(), Minecraft.getInstance().font, Component.literal("SOUL MENU"));
        this.parent = parent;
    }

    private SoulSkin.Skin add(List<SoulSkin.Skin> bucket, String label, String sub, String[] icon,
                              int style, int x, int y, int w, int h, float order,
                              Button.OnPress onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, sub, x, y, w, h, style, icon, SoulTheme.R_BUTTON,
                order, onPress);
        addWidget(s.button());
        bucket.add(s);
        return s;
    }

    @Override
    protected void init() {
        Minecraft minecraft = Minecraft.getInstance();
        sidebar.clear();
        content.clear();
        openTime = 0f;
        hudInstalled = SoulBridge.hudInstalled();
        hudOn = SoulBridge.hudEnabled();
        flashed = null;
        flashedOriginal = null;

        winW = Math.min(660, this.width - 40);
        winH = Math.min(400, this.height - 40);
        winX = (this.width - winW) / 2;
        winY = (this.height - winH) / 2;
        sideW = 168;
        contentX = winX + sideW + 26;
        contentW = winW - sideW - 52;

        int tabY = winY + 66;
        for (int i = 0; i < TAB_LABELS.length; i++) {
            int index = i;
            add(sidebar, TAB_LABELS[i], null, TAB_ICONS[i], SoulSkin.SIDEBAR,
                    winX + 12, tabY + i * 38, sideW - 24, 32, i * 0.4f, b -> setTab(index));
        }
        indicatorY = tabY;

        accountTile = add(content, "Account", SoulMc.username(), SoulIcons.USER, SoulSkin.TILE,
                contentX, winY + 74, contentW / 2 - 6, 62, 0.1f, b -> {
                    SoulMc.copy(SoulMc.username());
                    flashCopy(accountTile, "Account");
                });
        gameTile = add(content, "Game", "Minecraft " + SoulMc.mcVersion(), SoulIcons.CUBE, SoulSkin.TILE,
                contentX + contentW / 2 + 6, winY + 74, contentW / 2 - 6, 62, 0.15f, b -> {
                    SoulMc.copy("Minecraft " + SoulMc.mcVersion());
                    flashCopy(gameTile, "Game");
                });
        add(content, "Options", null, SoulIcons.GEAR, SoulSkin.SECONDARY,
                contentX, winY + 146, contentW / 2 - 6, 36, 0.2f,
                b -> minecraft.setScreen(new SoulSettingsScreen(this)));
        add(content, "Controls", null, SoulIcons.SLIDERS, SoulSkin.SECONDARY,
                contentX + contentW / 2 + 6, winY + 146, contentW / 2 - 6, 36, 0.25f,
                b -> minecraft.setScreen(new SoulKeybindScreen(this)));

        add(content, "Soul HUD", hudInstalled ? "Toggle with F6" : "Not installed",
                SoulIcons.EYES, SoulSkin.TILE,
                contentX, winY + 74, contentW, 62, 0.1f, b -> {
                    SoulBridge.toggleHud();
                    hudOn = SoulBridge.hudEnabled();
                });
        readoutsTile = add(content, "Readouts", "", null, SoulSkin.SECONDARY,
                contentX, winY + 146, contentW, 36, 0.2f, b -> {
                    // Readouts live on the HUD — tapping the row toggles them.
                    SoulBridge.toggleHud();
                    hudOn = SoulBridge.hudEnabled();
                });

        add(content, "Open Mod Menu", "Browse and configure installed mods", SoulIcons.CUBE,
                SoulSkin.PRIMARY, contentX, winY + 74, contentW, 40, 0.1f,
                b -> SoulMc.openMods(this));
        add(content, "Bundled content", "Performance, visuals and quality-of-life mods ship with the client",
                null, SoulSkin.SECONDARY, contentX, winY + 124, contentW, 40, 0.2f, b -> { });

        add(content, "Video & audio", null, SoulIcons.GEAR, SoulSkin.SECONDARY,
                contentX, winY + 74, contentW / 2 - 6, 40, 0.1f,
                b -> minecraft.setScreen(new SoulSettingsScreen(this)));
        add(content, "Key bindings", null, SoulIcons.SLIDERS, SoulSkin.SECONDARY,
                contentX + contentW / 2 + 6, winY + 74, contentW / 2 - 6, 40, 0.15f,
                b -> minecraft.setScreen(new SoulKeybindScreen(this)));
        aboutTile = add(content, "About", "Soul Client 1.0.0 · Minecraft " + SoulMc.mcVersion(),
                SoulIcons.COMPASS, SoulSkin.TILE, contentX, winY + 124, contentW, 56, 0.2f, b -> {
                    SoulMc.copy(aboutInfo());
                    flashCopy(aboutTile, "About");
                });

        applyTab();
    }

    private void setTab(int index) {
        tab = index;
        applyTab();
    }

    private void applyTab() {
        // Sidebar is always visible; content widgets are grouped by tab in the
        // order they are added in init(): dashboard 0-3, HUD 4-5, mods 6-7,
        // settings 8-10.
        int[] firstIndex = {0, 4, 6, 8};
        int[] lastIndex = {3, 5, 7, 10};
        for (SoulSkin.Skin s : sidebar) {
            s.button().visible = true;
        }
        int from = firstIndex[tab];
        int to = lastIndex[tab];
        for (int i = 0; i < content.size(); i++) {
            content.get(i).button().visible = i >= from && i <= to;
        }
    }

    /** Full build line the About tile copies to the clipboard. */
    private String aboutInfo() {
        return "Soul Client 1.0.0 · Minecraft " + SoulMc.mcVersion() + " · " + SoulMc.username();
    }

    /** Tile caption flips to "Copied!" for a beat after a clipboard press. */
    private void flashCopy(SoulSkin.Skin s, String original) {
        if (flashed != null && flashed != s) {
            flashed.label(flashedOriginal);
        }
        flashed = s;
        flashedOriginal = original;
        flashedAt = System.currentTimeMillis();
        s.label("Copied!");
    }

    /**
     * Live sub-line for the Readouts tile: soul-hud's real FPS/coords/ping
     * when installed, a static description otherwise. Mirrors the skin's own
     * sublabel placement (including the entrance slide) and truncates to fit.
     */
    private void drawReadouts(GuiGraphicsExtractor g, SoulSkin.Skin s) {
        String line = hudInstalled ? SoulBridge.readouts() : null;
        if (line == null) {
            line = "FPS, coordinates and ping in the corner";
        }
        int room = s.w - 24;
        String full = line;
        while (line.length() > 1 && this.font.width(line) > room) {
            line = line.substring(0, line.length() - 1);
        }
        if (!line.equals(full)) {
            line = (line.length() > 1 ? line.substring(0, line.length() - 1) : "") + "…";
        }
        float enter = s.entrance();
        if (enter <= 0.01f) {
            return;
        }
        int textY = s.y + (int) ((1f - enter) * 12f) + (s.h / 2 - 8) + 11;
        SoulPaint.text(g, this.font, line, s.x + 12, textY,
                SoulTheme.scaleAlpha(SoulTheme.TEXT_FAINT, enter));
    }

    @Override
    public void onClose() {
        Minecraft minecraft = Minecraft.getInstance();
        if (parent != null) {
            minecraft.setScreen(parent);
        } else {
            minecraft.setScreen(null);
        }
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
        float dt = Math.min(delta, 0.1f);
        openTime += dt;
        extractBlurredBackground(g);
        g.fill(0, 0, this.width, this.height, 0x8005070B);

        int pop = (int) ((1f - SoulTheme.easeOut(SoulTheme.clamp01(openTime / 0.18f))) * 10f);
        int y = winY + pop;
        SoulPaint.shadow(g, winX, y, winW, winH, SoulTheme.R_WINDOW, 7, 0xB8000000);
        SoulPaint.roundRect(g, winX, y, winW, winH, SoulTheme.R_WINDOW, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(g, winX, y, winW, winH, SoulTheme.R_WINDOW, SoulTheme.LINE_STRONG);
        SoulPaint.roundRect(g, winX + 1, y + 1, winW - 2, 1, 1, SoulTheme.GLOSS);

        SoulPaint.roundRect(g, winX + 1, y + 1, sideW, winH - 2, SoulTheme.R_WINDOW, SoulTheme.SIDEBAR);
        g.fill(winX + sideW - SoulTheme.R_WINDOW, y + 1, winX + sideW, y + winH - 1, SoulTheme.SIDEBAR);
        g.fill(winX + sideW, y + SoulTheme.R_WINDOW, winX + sideW + 1, y + winH - SoulTheme.R_WINDOW,
                SoulTheme.LINE_SOFT);

        SoulTex.logo(g, winX + 20, y + 18, 24);
        SoulPaint.tracked(g, this.font, "SOUL", winX + 52, y + 26, SoulTheme.TEXT);
        SoulPaint.divider(g, winX + 16, y + 54, sideW - 32, SoulTheme.LINE_SOFT);

        float targetY = winY + 66 + tab * 38 + 5;
        indicatorY = SoulTheme.approach(indicatorY, targetY, 16f, dt);
        g.fill(winX + 12, (int) indicatorY, winX + 14, (int) indicatorY + 22, SoulTheme.ACCENT);
        SoulPaint.accentGlow(g, winX + 12, (int) indicatorY, 2, 22, 1, 0.7f);

        SoulPaint.display(g, this.font, TAB_LABELS[tab].toUpperCase(), contentX, y + 24, 1.6f,
                SoulTheme.TEXT);
        SoulPaint.tracked(g, this.font, TAB_SUBTITLES[tab].toUpperCase(),
                contentX + SoulPaint.displayWidth(this.font, TAB_LABELS[tab].toUpperCase(), 1.6f) + 12,
                y + 30, SoulTheme.TEXT_FAINT);
        SoulPaint.divider(g, contentX, y + 56, contentW, SoulTheme.LINE_SOFT);

        String user = SoulMc.username();
        int uw = this.font.width(user);
        SoulPaint.pill(g, winX + sideW - uw - 30, y + winH - 26, uw + 22, 18, SoulTheme.CARD);
        SoulPaint.text(g, this.font, user, winX + sideW - uw - 19, y + winH - 22, SoulTheme.TEXT_FAINT);

        super.extractRenderState(g, mouseX, mouseY, delta);

        if (flashed != null && System.currentTimeMillis() - flashedAt > 1200) {
            flashed.label(flashedOriginal);
            flashed = null;
        }
        for (SoulSkin.Skin s : sidebar) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
        }
        for (SoulSkin.Skin s : content) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
            if (tab == 1 && s == readoutsTile && s.button().visible) {
                drawReadouts(g, s);
            }
            if (tab == 1 && s.label.equals("Soul HUD") && s.button().visible) {
                drawSwitch(g, s);
            }
        }
    }

    private void drawSwitch(GuiGraphicsExtractor g, SoulSkin.Skin s) {
        int sw = 40;
        int sh = 20;
        int sx = s.x + s.w - sw - 14;
        int sy = s.y + (s.h - sh) / 2;
        boolean on = hudOn && hudInstalled;
        SoulPaint.pill(g, sx, sy, sw, sh, on ? SoulTheme.ACCENT : 0x33FFFFFF);
        if (!on) {
            SoulPaint.pillOutline(g, sx, sy, sw, sh, SoulTheme.LINE);
        }
        int knob = on ? sx + sw - sh + 2 : sx + 2;
        SoulPaint.roundRect(g, knob, sy + 2, sh - 4, sh - 4, sh / 2 - 2,
                on ? SoulTheme.ACCENT_INK : SoulTheme.TEXT_DIM);
    }
}
