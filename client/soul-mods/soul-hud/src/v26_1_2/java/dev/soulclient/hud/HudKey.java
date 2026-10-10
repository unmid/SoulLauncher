package dev.soulclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

/** HUD keybind adapter — official names (Minecraft 26.1+). */
public final class HudKey {

    private HudKey() {
    }

    public static KeyMapping registerF6() {
        return KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.soulclient.hud",
                InputConstants.Type.KEYSYM,
                GLFW.GLFW_KEY_F6,
                KeyMapping.Category.register(Identifier.fromNamespaceAndPath("soulclient", "main"))
        ));
    }
}
