package dev.soulclient.ui;

import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.List;

/** Soul Client pause panel: blurred world behind a single glass card. */
public class SoulPauseScreen extends Screen {

    private final List<SoulSkin.Skin> skins = new ArrayList<>();
    private int cardX;
    private int cardY;
    private int cardW;
    private int cardH;

    public SoulPauseScreen() {
        super(Text.literal("Game Paused"));
    }

    private void skin(String label, String[] icon, int style, int x, int y, int w, int h, float order,
                      ButtonWidget.PressAction onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, x, y, w, h, style, icon, SoulTheme.R_BUTTON, order, onPress);
        addSelectableChild(s.button());
        skins.add(s);
    }

    @Override
    protected void init() {
        MinecraftClient client = MinecraftClient.getInstance();
        skins.clear();

        int w = Math.min(340, this.width - 80);
        cardW = w + 48;
        cardH = 268;
        cardX = (this.width - cardW) / 2;
        cardY = (this.height - cardH) / 2;
        int x = (this.width - w) / 2;
        int bh = 34;
        int gap = 9;
        int y0 = cardY + 92;

        skin("Back to Game", SoulIcons.PLAY, SoulSkin.PRIMARY, x, y0, w, bh, 0f,
                b -> client.setScreen(null));
        skin("Soul Menu", SoulIcons.SPARK, SoulSkin.SECONDARY, x, y0 + (bh + gap), w, bh, 1f,
                b -> client.setScreen(new SoulMenuScreen(null)));
        skin("Options", SoulIcons.GEAR, SoulSkin.SECONDARY, x, y0 + 2 * (bh + gap), w, bh, 2f,
                b -> client.setScreen(new SoulSettingsScreen(this)));
        skin(SoulMc.quitLabel(), SoulIcons.POWER, SoulSkin.GHOST, x, y0 + 3 * (bh + gap), w, bh, 3f,
                b -> SoulMc.saveAndQuit(client));
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        float dt = Math.min(delta, 0.1f);
        this.renderBackground(ctx, mouseX, mouseY, delta);
        ctx.fill(0, 0, this.width, this.height, 0x73000000);

        SoulPaint.shadow(ctx, cardX, cardY, cardW, cardH, SoulTheme.R_WINDOW, 6, 0xB3000000);
        SoulPaint.roundRect(ctx, cardX, cardY, cardW, cardH, SoulTheme.R_WINDOW, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(ctx, cardX, cardY, cardW, cardH, SoulTheme.R_WINDOW, SoulTheme.LINE);
        SoulPaint.roundRect(ctx, cardX + 1, cardY + 1, cardW - 2, 1, 1, SoulTheme.GLOSS);

        SoulTex.logo(ctx, cardX + 24, cardY + 20, 34);
        SoulPaint.display(ctx, this.textRenderer, "PAUSED", cardX + 68, cardY + 22, 1.8f, SoulTheme.TEXT);
        SoulPaint.tracked(ctx, this.textRenderer, SoulMc.username(), cardX + 24, cardY + 62, SoulTheme.TEXT_FAINT);

        int statusW = SoulPaint.trackedWidth(this.textRenderer, "IN-GAME");
        SoulPaint.pill(ctx, cardX + cardW - 24 - statusW - 14, cardY + 26, statusW + 14, 18, SoulTheme.ACCENT_SOFT);
        SoulPaint.tracked(ctx, this.textRenderer, "IN-GAME", cardX + cardW - 24 - statusW - 7,
                cardY + 31, SoulTheme.ACCENT);

        SoulPaint.divider(ctx, cardX + 20, cardY + 78, cardW - 40, SoulTheme.LINE_SOFT);

        super.render(ctx, mouseX, mouseY, delta);

        for (SoulSkin.Skin s : skins) {
            SoulSkin.draw(ctx, this.textRenderer, s, dt, mouseX, mouseY);
        }

        String hint = "ESC to resume";
        int hw = this.textRenderer.getWidth(hint);
        SoulPaint.tracked(ctx, this.textRenderer, hint, cardX + (cardW - hw) / 2, cardY + cardH - 22,
                SoulTheme.TEXT_FAINT);
    }
}
