package dev.soulclient.ui;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;

/**
 * Soul Client's in-game shell.
 *
 * <p>Swaps the vanilla title screen for the branded home, the vanilla pause
 * menu for the Soul pause panel, decorates the multiplayer browser and
 * registers the Right-Shift Soul Menu keybind.</p>
 */
public class SoulClientUI implements ClientModInitializer {

    @Override
    public void onInitializeClient() {
        ScreenEvents.AFTER_INIT.register((client, screen, scaledWidth, scaledHeight) -> {
            if (screen instanceof TitleScreen) {
                client.setScreen(new SoulTitleScreen());
            } else if (screen.getClass() == GameMenuScreen.class) {
                client.setScreen(new SoulPauseScreen());
            } else if (screen instanceof MultiplayerScreen) {
                SoulBranding.decorate(screen);
            }
        });

        SoulMc.registerMenuKey(() -> {
            MinecraftClient client = MinecraftClient.getInstance();
            if (client.currentScreen instanceof SoulMenuScreen menu) {
                menu.close();
            } else if (client.world != null && client.currentScreen == null) {
                client.setScreen(new SoulMenuScreen(null));
            }
        });
    }
}
