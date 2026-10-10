package dev.soulclient.ui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.network.CookieStorage;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;

import java.util.HashMap;

/** Connect-to-server adapter — isolated per Minecraft version. */
public final class SoulNet {

    private SoulNet() {
    }

    public static void join(Screen parent, String name, String address) {
        MinecraftClient client = MinecraftClient.getInstance();
        ServerAddress parsed = ServerAddress.parse(address);
        ServerInfo info = new ServerInfo(name, address, ServerInfo.ServerType.OTHER);
        ConnectScreen.connect(parent, client, parsed, info, false, new CookieStorage(new HashMap<>()));
    }
}
