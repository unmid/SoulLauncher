package dev.soulclient.ui;

import dev.soulclient.SoulData;
import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/** Soul Client home (Minecraft 26.1+, official names). */
public class SoulTitleScreen extends Screen {

    private final List<SoulSkin.Skin> skins = new ArrayList<>();
    private final List<Button> cardButtons = new ArrayList<>();
    private final List<SoulData.Featured> featured = SoulData.FEATURED;

    private float openTime;
    private boolean showPanel;
    private int panelX;
    private int panelY;
    private int panelW;
    private int panelH;
    private final int rowH = 58;
    private final int rowGap = 8;

    public SoulTitleScreen() {
        super(Minecraft.getInstance(), Minecraft.getInstance().font, Component.literal("SOUL CLIENT"));
    }

    private void skin(String label, String[] icon, int style, int x, int y, int w, int h, float order,
                      Button.OnPress onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, x, y, w, h, style, icon, SoulTheme.R_BUTTON, order, onPress);
        addWidget(s.button());
        skins.add(s);
    }

    @Override
    protected void init() {
        Minecraft minecraft = Minecraft.getInstance();
        skins.clear();
        cardButtons.clear();
        openTime = 0f;

        int colX = 40;
        int colW = Math.min(310, Math.max(230, this.width / 4));
        int bh = 34;
        int gap = 9;
        int total = bh * 5 + gap * 4;
        int colY = Math.max(150, this.height / 2 - total / 2 + 26);

        skin("Multiplayer", SoulIcons.GLOBE, SoulSkin.PRIMARY, colX, colY, colW, bh, 0f,
                b -> minecraft.setScreen(new JoinMultiplayerScreen(this)));
        skin("Singleplayer", SoulIcons.CUBE, SoulSkin.SECONDARY, colX, colY + (bh + gap), colW, bh, 1f,
                b -> minecraft.setScreen(new SelectWorldScreen(this)));
        skin("Soul Menu", SoulIcons.SPARK, SoulSkin.SECONDARY, colX, colY + 2 * (bh + gap), colW, bh, 2f,
                b -> minecraft.setScreen(new SoulMenuScreen(this)));
        skin("Options", SoulIcons.GEAR, SoulSkin.SECONDARY, colX, colY + 3 * (bh + gap), colW, bh, 3f,
                b -> minecraft.setScreen(new SoulSettingsScreen(this)));
        skin("Quit Game", SoulIcons.POWER, SoulSkin.GHOST, colX, colY + 4 * (bh + gap), colW, bh, 4f,
                b -> SoulMc.quit());

        showPanel = this.width >= 820;
        if (showPanel) {
            panelW = Math.min(330, Math.max(280, this.width / 4));
            panelX = this.width - 40 - panelW;
            panelY = Math.max(96, this.height / 2
                    - (rowH * featured.size() + rowGap * (featured.size() - 1) + 58) / 2);
            panelH = 58 + rowH * featured.size() + rowGap * (featured.size() - 1) + 16;
            for (int i = 0; i < featured.size(); i++) {
                SoulData.Featured f = featured.get(i);
                int ry = panelY + 48 + i * (rowH + rowGap);
                Button card = Button.builder(Component.literal("Join " + f.name()),
                                b -> SoulNet.join(this, f.name(), f.address()))
                        .bounds(panelX + 14, ry, panelW - 28, rowH).build();
                cardButtons.add(card);
                addWidget(card);
            }
        }
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
        openTime += delta;
        float dt = Math.min(delta, 0.1f);

        SoulTex.wallpaper(g, this.width, this.height);
        SoulPaint.leftScrim(g, this.height, Math.min(this.width, 520), 0xB4);
        SoulPaint.bottomScrim(g, this.width, this.height, 0x66);
        SoulPaint.topScrim(g, this.width, this.height, 0x99);

        drawTopBar(g);
        drawBrand(g);
        if (showPanel) {
            drawPanel(g);
        }

        super.extractRenderState(g, mouseX, mouseY, delta);

        for (SoulSkin.Skin s : skins) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
        }
        if (showPanel) {
            drawRows(g, mouseX, mouseY);
        }

        SoulPaint.tracked(g, this.font, "SOUL CLIENT BUILD 1.0.0", 40, this.height - 16,
                SoulTheme.TEXT_FAINT);
    }

    private void drawTopBar(GuiGraphicsExtractor g) {
        SoulPaint.hGradient(g, 0, 0, this.width, 42, 0xC905070B, 0x0005070B);
        SoulPaint.divider(g, 0, 42, this.width, SoulTheme.LINE_SOFT);
        SoulTex.logo(g, 18, 8, 26);
        SoulPaint.tracked(g, this.font, "SOUL CLIENT", 54, 17, SoulTheme.TEXT);

        String ver = "MC " + SoulMc.mcVersion();
        int vw = SoulPaint.trackedWidth(this.font, ver);
        SoulPaint.tracked(g, this.font, ver, this.width - vw - 92, 17, SoulTheme.TEXT_FAINT);

        String user = SoulMc.username();
        int uw = this.font.width(user);
        int chipW = uw + 26;
        int chipX = this.width - chipW - 18;
        SoulPaint.pill(g, chipX, 9, chipW, 24, SoulTheme.CARD);
        SoulPaint.pillOutline(g, chipX, 9, chipW, 24, SoulTheme.LINE);
        SoulPaint.roundRect(g, chipX + 6, 14, 14, 14, 3, SoulTheme.ACCENT_SOFT);
        SoulPaint.textCentered(g, this.font, user.substring(0, 1).toUpperCase(), chipX + 13, 17,
                SoulTheme.ACCENT);
        SoulPaint.text(g, this.font, user, chipX + 24, 17, SoulTheme.TEXT_DIM);
    }

    private void drawBrand(GuiGraphicsExtractor g) {
        int x = 40;
        int y = 62;
        SoulPaint.accentGlow(g, x, y, 44, 44, 10, 0.5f);
        SoulTex.logo(g, x, y, 44);
        SoulPaint.display(g, this.font, "SOUL", x, y + 54, 2.6f, SoulTheme.ACCENT);
        SoulPaint.display(g, this.font, "CLIENT", x, y + 78, 2.6f, SoulTheme.TEXT);
        int lineW = SoulPaint.displayWidth(this.font, "SOUL", 2.6f);
        SoulPaint.roundRect(g, x, y + 66, Math.max(60, lineW), 2, 1, SoulTheme.ACCENT);
        SoulPaint.tracked(g, this.font, "FAST  MINIMAL  YOURS", x + 2, y + 74, SoulTheme.TEXT_FAINT);
    }

    private void drawPanel(GuiGraphicsExtractor g) {
        SoulPaint.shadow(g, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, 5, 0x99000000);
        SoulPaint.roundRect(g, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(g, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, SoulTheme.LINE);
        SoulPaint.roundRect(g, panelX + 1, panelY + 1, panelW - 2, 1, 1, SoulTheme.GLOSS);
        SoulPaint.text(g, this.font, "FEATURED", panelX + 16, panelY + 16, SoulTheme.TEXT);
        int cntW = SoulPaint.trackedWidth(this.font, "COMMUNITY SERVERS");
        SoulPaint.tracked(g, this.font, "COMMUNITY SERVERS", panelX + panelW - 16 - cntW,
                panelY + 18, SoulTheme.TEXT_FAINT);
        SoulPaint.divider(g, panelX + 14, panelY + 34, panelW - 28, SoulTheme.LINE_SOFT);
    }

    private void drawRows(GuiGraphicsExtractor g, double mouseX, double mouseY) {
        for (int i = 0; i < cardButtons.size(); i++) {
            SoulData.Featured f = featured.get(i);
            int x = panelX + 14;
            int y = panelY + 48 + i * (rowH + rowGap);
            int w = panelW - 28;
            boolean hover = mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + rowH;
            float shine = hover ? 1f : 0f;

            SoulPaint.roundRect(g, x, y, w, rowH, SoulTheme.R_CARD,
                    SoulTheme.mix(SoulTheme.CARD_SUNKEN, SoulTheme.CARD_HOVER, shine));
            SoulPaint.roundRectOutline(g, x, y, w, rowH, SoulTheme.R_CARD,
                    SoulTheme.mix(SoulTheme.LINE_SOFT, SoulTheme.ACCENT, shine * 0.8f));
            if (hover) {
                g.fill(x + 1, y + 6, x + 3, y + rowH - 6, SoulTheme.ACCENT);
            }

            int bx = x + 12;
            int by = y + (rowH - 34) / 2;
            SoulPaint.roundRect(g, bx, by, 34, 34, 7, SoulTheme.ACCENT_SOFT);
            SoulPaint.roundRectOutline(g, bx, by, 34, 34, 7,
                    SoulTheme.mix(SoulTheme.LINE_SOFT, SoulTheme.ACCENT, shine * 0.7f));
            SoulPaint.textCentered(g, this.font, f.initials(), bx + 17, by + 13,
                    SoulTheme.mix(SoulTheme.TEXT, SoulTheme.ACCENT, shine));

            SoulPaint.text(g, this.font, f.name(), bx + 46, y + 13, SoulTheme.TEXT);
            SoulPaint.text(g, this.font, f.address(), bx + 46, y + 26, SoulTheme.TEXT_FAINT);
            int tagW = SoulPaint.trackedWidth(this.font, f.tag()) + 12;
            SoulPaint.pill(g, x + w - tagW - 10, y + 10, tagW, 14, 0x22FFFFFF);
            SoulPaint.tracked(g, this.font, f.tag(), x + w - tagW - 4, y + 14, SoulTheme.TEXT_FAINT);
            SoulPaint.icon(g, SoulIcons.CHEVRON, x + w - 16, y + rowH / 2 - 3, 1,
                    SoulTheme.withAlpha(SoulTheme.ACCENT, hover ? 255 : 0));
        }
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public void onClose() {
    }
}
