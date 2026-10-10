package dev.soulclient.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.TransferState;
import net.minecraft.client.multiplayer.resolver.ServerAddress;

import java.util.HashMap;

/** Connect-to-server adapter — TransferState replaced CookieStorage (26.1+). */
public final class SoulNet {

    private SoulNet() {
    }

    public static void join(Screen parent, String name, String address) {
        Minecraft minecraft = Minecraft.getInstance();
        ServerAddress parsed = ServerAddress.parseString(address);
        ServerData info = new ServerData(name, address, ServerData.Type.OTHER);
        ConnectScreen.startConnecting(parent, minecraft, parsed, info, false,
                new TransferState(new HashMap<>(), new HashMap<>(), false));
    }
}
