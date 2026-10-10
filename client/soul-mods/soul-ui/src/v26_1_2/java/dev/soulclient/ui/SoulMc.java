package dev.soulclient.ui;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

import java.lang.reflect.Constructor;

/** Misc Minecraft-surface adapters — official names, KeyMapping (26.1+). */
public final class SoulMc {

    private SoulMc() {
    }

    public static String username() {
        return Minecraft.getInstance().getUser().getName();
    }

    /** Copies text to the system clipboard — the menu's copy-on-tap tiles. */
    public static void copy(String text) {
        Minecraft.getInstance().keyboardHandler.setClipboard(text);
    }

    public static boolean mouseDown() {
        Minecraft minecraft = Minecraft.getInstance();
        return GLFW.glfwGetMouseButton(minecraft.getWindow().handle(), GLFW.GLFW_MOUSE_BUTTON_LEFT)
                == GLFW.GLFW_PRESS;
    }

    public static String mcVersion() {
        return Minecraft.getInstance().getLaunchedVersion();
    }

    public static void quit() {
        Minecraft.getInstance().stop();
    }

    public static String quitLabel() {
        return Minecraft.getInstance().hasSingleplayerServer() ? "Save and Quit to Title" : "Disconnect";
    }

    public static void saveAndQuit(Minecraft minecraft) {
        if (minecraft.hasSingleplayerServer()) {
            minecraft.disconnectWithSavingScreen();
        } else {
            minecraft.disconnect(new TitleScreen(), false);
        }
    }

    /** All keybinds in registration order — Soul keybind screen input. */
    public static KeyMapping[] allBinds() {
        return Minecraft.getInstance().options.keyMappings;
    }

    /** Localized action name ("Forward", "Jump", …). */
    public static String bindAction(KeyMapping bind) {
        return KeyMapping.createNameSupplier(bind.getName()).get().getString();
    }

    /** Localized category name ("Movement", …). */
    public static String bindCategory(KeyMapping bind) {
        return bind.getCategory().label().getString();
    }

    /** Current binding as the user sees it in vanilla options. */
    public static String bindName(KeyMapping bind) {
        return bind.isUnbound() ? "UNBOUND" : bind.getTranslatedKeyMessage().getString();
    }

    public static boolean isKeyDown(int code) {
        Minecraft minecraft = Minecraft.getInstance();
        return GLFW.glfwGetKey(minecraft.getWindow().handle(), code) == GLFW.GLFW_PRESS;
    }

    /** Rebinds through the vanilla path so the action map and config stay in sync. */
    public static void bindKey(KeyMapping bind, int code) {
        bind.setKey(InputConstants.Type.KEYSYM.getOrCreate(code));
        KeyMapping.resetMapping();
        Minecraft.getInstance().options.save();
    }

    public static void openMods(Screen parent) {
        try {
            Class<?> cls = Class.forName("com.terraformersmc.modmenu.gui.ModsScreen");
            Constructor<?> ctor = cls.getConstructor(Screen.class);
            Minecraft.getInstance().setScreen((Screen) ctor.newInstance(parent));
        } catch (Throwable ignored) {
        }
    }

    public static void toggleHud() {
        try {
            Class<?> cls = Class.forName("dev.soulclient.hud.SoulHud");
            cls.getMethod("toggle").invoke(null);
        } catch (Throwable ignored) {
        }
    }

    public static String hudStatus() {
        try {
            Class<?> cls = Class.forName("dev.soulclient.hud.SoulHud");
            boolean on = (Boolean) cls.getField("visible").get(null);
            return on ? "Soul HUD: ON (F6)" : "Soul HUD: OFF (F6)";
        } catch (Throwable t) {
            return "Soul HUD: not installed";
        }
    }

    /** Invert-Vertical-Mouse option (official name since 26.x). */
    public static net.minecraft.client.OptionInstance<Boolean> invertY() {
        return Minecraft.getInstance().options.invertMouseY();
    }

    /**
     * The fullscreen option only stores intent; the window owns the real
     * state, so reconcile the two instead of blindly toggling.
     */
    public static void applyFullscreen(boolean on) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.getWindow().isFullscreen() != on) {
            minecraft.getWindow().toggleFullScreen();
        }
    }

    public static void registerMenuKey(Runnable onPress) {
        KeyMapping key = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.soulclient.menu",
                InputConstants.Type.KEYSYM,
                GLFW.GLFW_KEY_RIGHT_SHIFT,
                KeyMapping.Category.register(Identifier.fromNamespaceAndPath("soulclient", "main"))
        ));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (key.consumeClick()) {
                onPress.run();
            }
        });
    }
}
