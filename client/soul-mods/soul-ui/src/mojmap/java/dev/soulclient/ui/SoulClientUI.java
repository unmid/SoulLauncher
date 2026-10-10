package dev.soulclient.ui;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;

/**
 * Soul Client's in-game shell (Minecraft 26.1+, official names).
 *
 * <p>Swaps the vanilla title screen for the branded home, the vanilla pause
 * menu for the Soul pause panel and registers the Right-Shift Soul Menu.</p>
 */
public class SoulClientUI implements ClientModInitializer {

    @Override
    public void onInitializeClient() {
        ScreenEvents.AFTER_INIT.register((client, screen, scaledWidth, scaledHeight) -> {
            if (screen instanceof TitleScreen) {
                client.setScreen(new SoulTitleScreen());
            } else if (screen.getClass() == PauseScreen.class) {
                client.setScreen(new SoulPauseScreen());
            } else if (screen instanceof JoinMultiplayerScreen) {
                SoulBranding.decorate(screen);
            }
        });

        SoulMc.registerMenuKey(() -> {
            Minecraft minecraft = Minecraft.getInstance();
            if (minecraft.screen instanceof SoulMenuScreen menu) {
                menu.onClose();
            } else if (minecraft.level != null && minecraft.screen == null) {
                minecraft.setScreen(new SoulMenuScreen(null));
            }
        });
    }
}
