package dev.soulclient.ui;

import dev.soulclient.SoulData;
import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.List;

/**
 * Soul Client home: full-bleed wallpaper, brand lockup, animated action
 * column and a glassy featured-server panel that quick-joins on click.
 */
public class SoulTitleScreen extends Screen {

    private final List<SoulSkin.Skin> skins = new ArrayList<>();
    private final List<ButtonWidget> cardButtons = new ArrayList<>();
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
        super(Text.literal("SOUL CLIENT"));
    }

    private SoulSkin.Skin skin(String label, String[] icon, int style, int x, int y, int w, int h,
                               float order, ButtonWidget.PressAction onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, x, y, w, h, style, icon,
                style == SoulSkin.GHOST ? SoulTheme.R_BUTTON : SoulTheme.R_BUTTON, order, onPress);
        addSelectableChild(s.button());
        skins.add(s);
        return s;
    }

    @Override
    protected void init() {
        MinecraftClient client = MinecraftClient.getInstance();
        skins.clear();
        cardButtons.clear();
        openTime = 0f;

        int colX = 40;
        int colW = Math.min(310, Math.max(230, this.width / 4));
        int bh = 34;
        int gap = 9;
        int total = bh * 5 + gap * 4;
        int colY = Math.max(150, this.height / 2 - total / 2 + 26);

        skin("Multiplayer", SoulIcons.GLOBE, SoulSkin.PRIMARY, colX, colY, colW, bh, 0.0f,
                b -> client.setScreen(new MultiplayerScreen(this)));
        skin("Singleplayer", SoulIcons.CUBE, SoulSkin.SECONDARY, colX, colY + (bh + gap), colW, bh, 1f,
                b -> client.setScreen(new SelectWorldScreen(this)));
        skin("Soul Menu", SoulIcons.SPARK, SoulSkin.SECONDARY, colX, colY + 2 * (bh + gap), colW, bh, 2f,
                b -> client.setScreen(new SoulMenuScreen(this)));
        skin("Options", SoulIcons.GEAR, SoulSkin.SECONDARY, colX, colY + 3 * (bh + gap), colW, bh, 3f,
                b -> client.setScreen(new SoulSettingsScreen(this)));
        skin("Quit Game", SoulIcons.POWER, SoulSkin.GHOST, colX, colY + 4 * (bh + gap), colW, bh, 4f,
                b -> SoulMc.quit());

        showPanel = this.width >= 820;
        if (showPanel) {
            panelW = Math.min(330, Math.max(280, this.width / 4));
            panelX = this.width - 40 - panelW;
            panelY = Math.max(96, this.height / 2 - (rowH * featured.size() + rowGap * (featured.size() - 1) + 58) / 2);
            panelH = 58 + rowH * featured.size() + rowGap * (featured.size() - 1) + 16;
            for (int i = 0; i < featured.size(); i++) {
                SoulData.Featured f = featured.get(i);
                int ry = panelY + 48 + i * (rowH + rowGap);
                ButtonWidget card = ButtonWidget.builder(Text.literal("Join " + f.name()),
                                b -> SoulNet.join(this, f.name(), f.address()))
                        .dimensions(panelX + 14, ry, panelW - 28, rowH).build();
                cardButtons.add(card);
                addSelectableChild(card);
            }
        }
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        openTime += delta;
        float dt = Math.min(delta, 0.1f);

        SoulTex.wallpaper(ctx, this.width, this.height);
        SoulPaint.leftScrim(ctx, this.height, Math.min(this.width, 520), 0xB4);
        SoulPaint.bottomScrim(ctx, this.width, this.height, 0x66);
        SoulPaint.topScrim(ctx, this.width, this.height, 0x99);

        drawTopBar(ctx);
        drawBrand(ctx);

        if (showPanel) {
            drawPanel(ctx);
        }

        super.render(ctx, mouseX, mouseY, delta);

        for (SoulSkin.Skin s : skins) {
            SoulSkin.draw(ctx, this.textRenderer, s, dt, mouseX, mouseY);
        }
        if (showPanel) {
            drawRows(ctx, mouseX, mouseY);
        }

        SoulPaint.tracked(ctx, this.textRenderer, "SOUL CLIENT BUILD 1.0.0", 40, this.height - 16,
                SoulTheme.TEXT_FAINT);
    }

    private void drawTopBar(DrawContext ctx) {
        SoulPaint.hGradient(ctx, 0, 0, this.width, 42, 0xC905070B, 0x0005070B);
        SoulPaint.divider(ctx, 0, 42, this.width, SoulTheme.LINE_SOFT);
        SoulTex.logo(ctx, 18, 8, 26);
        SoulPaint.tracked(ctx, this.textRenderer, "SOUL CLIENT", 54, 17, SoulTheme.TEXT);

        String ver = "MC " + SoulMc.mcVersion();
        int vw = SoulPaint.trackedWidth(this.textRenderer, ver);
        SoulPaint.tracked(ctx, this.textRenderer, ver, this.width - vw - 92, 17, SoulTheme.TEXT_FAINT);

        String user = SoulMc.username();
        int uw = this.textRenderer.getWidth(user);
        int chipW = uw + 26;
        int chipX = this.width - chipW - 18;
        SoulPaint.pill(ctx, chipX, 9, chipW, 24, SoulTheme.CARD);
        SoulPaint.pillOutline(ctx, chipX, 9, chipW, 24, SoulTheme.LINE);
        SoulPaint.roundRect(ctx, chipX + 6, 14, 14, 14, 3, SoulTheme.ACCENT_SOFT);
        SoulPaint.textCentered(ctx, this.textRenderer, user.substring(0, 1).toUpperCase(),
                chipX + 13, 17, SoulTheme.ACCENT);
        SoulPaint.text(ctx, this.textRenderer, user, chipX + 24, 17, SoulTheme.TEXT_DIM);
    }

    private void drawBrand(DrawContext ctx) {
        int x = 40;
        int y = 62;
        SoulPaint.accentGlow(ctx, x, y, 44, 44, 10, 0.5f);
        SoulTex.logo(ctx, x, y, 44);
        SoulPaint.display(ctx, this.textRenderer, "SOUL", x, y + 54, 2.6f, SoulTheme.ACCENT);
        SoulPaint.display(ctx, this.textRenderer, "CLIENT", x, y + 78, 2.6f, SoulTheme.TEXT);
        int lineW = SoulPaint.displayWidth(this.textRenderer, "SOUL", 2.6f);
        SoulPaint.roundRect(ctx, x, y + 66, Math.max(60, lineW), 2, 1, SoulTheme.ACCENT);
        SoulPaint.tracked(ctx, this.textRenderer, "FAST  MINIMAL  YOURS", x + 2, y + 74, SoulTheme.TEXT_FAINT);
    }

    private void drawPanel(DrawContext ctx) {
        SoulPaint.shadow(ctx, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, 5, 0x99000000);
        SoulPaint.roundRect(ctx, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(ctx, panelX, panelY, panelW, panelH, SoulTheme.R_PANEL, SoulTheme.LINE);
        SoulPaint.roundRect(ctx, panelX + 1, panelY + 1, panelW - 2, 1, 1, SoulTheme.GLOSS);

        SoulPaint.text(ctx, this.textRenderer, "FEATURED", panelX + 16, panelY + 16, SoulTheme.TEXT);
        int cntW = SoulPaint.trackedWidth(this.textRenderer, "COMMUNITY SERVERS");
        SoulPaint.tracked(ctx, this.textRenderer, "COMMUNITY SERVERS",
                panelX + panelW - 16 - cntW, panelY + 18, SoulTheme.TEXT_FAINT);
        SoulPaint.divider(ctx, panelX + 14, panelY + 34, panelW - 28, SoulTheme.LINE_SOFT);
    }

    private void drawRows(DrawContext ctx, double mouseX, double mouseY) {
        for (int i = 0; i < cardButtons.size(); i++) {
            SoulData.Featured f = featured.get(i);
            int x = panelX + 14;
            int y = panelY + 48 + i * (rowH + rowGap);
            int w = panelW - 28;
            boolean hover = mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + rowH;
            float shine = hover ? 1f : 0f;

            SoulPaint.roundRect(ctx, x, y, w, rowH, SoulTheme.R_CARD,
                    SoulTheme.mix(SoulTheme.CARD_SUNKEN, SoulTheme.CARD_HOVER, shine));
            SoulPaint.roundRectOutline(ctx, x, y, w, rowH, SoulTheme.R_CARD,
                    SoulTheme.mix(SoulTheme.LINE_SOFT, SoulTheme.ACCENT, shine * 0.8f));
            if (hover) {
                g_accentBar(ctx, x, y, rowH);
            }

            int bx = x + 12;
            int by = y + (rowH - 34) / 2;
            SoulPaint.roundRect(ctx, bx, by, 34, 34, 7, SoulTheme.ACCENT_SOFT);
            SoulPaint.roundRectOutline(ctx, bx, by, 34, 34, 7,
                    SoulTheme.mix(SoulTheme.LINE_SOFT, SoulTheme.ACCENT, shine * 0.7f));
            SoulPaint.textCentered(ctx, this.textRenderer, f.initials(), bx + 17, by + 13,
                    SoulTheme.mix(SoulTheme.TEXT, SoulTheme.ACCENT, shine));

            SoulPaint.text(ctx, this.textRenderer, f.name(), bx + 46, y + 13, SoulTheme.TEXT);
            SoulPaint.text(ctx, this.textRenderer, f.address(), bx + 46, y + 26, SoulTheme.TEXT_FAINT);
            int tagW = SoulPaint.trackedWidth(this.textRenderer, f.tag()) + 12;
            SoulPaint.pill(ctx, x + w - tagW - 10, y + 10, tagW, 14, 0x22FFFFFF);
            SoulPaint.tracked(ctx, this.textRenderer, f.tag(), x + w - tagW - 4, y + 14, SoulTheme.TEXT_FAINT);

            SoulPaint.icon(ctx, SoulIcons.CHEVRON, x + w - 16, y + rowH / 2 - 3, 1,
                    SoulTheme.withAlpha(SoulTheme.ACCENT, (int) (hover ? 255 : 0)));
        }
    }

    private void g_accentBar(DrawContext ctx, int x, int y, int h) {
        ctx.fill(x + 1, y + 6, x + 3, y + h - 6, SoulTheme.ACCENT);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public void close() {
    }
}
