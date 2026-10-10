package dev.soulclient.hud;

import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

/** HUD keybind adapter — string key categories (Minecraft 1.21.1). */
public final class HudKey {

    private HudKey() {
    }

    public static KeyBinding registerF6() {
        return KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.soulclient.hud",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_F6,
                "category.soulclient"
        ));
    }
}
