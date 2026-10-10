package dev.soulclient.ui;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.screen.ScreenTexts;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;

import java.lang.reflect.Constructor;

/** Misc Minecraft-surface adapters — KeyBinding.Category + new disconnect API (1.21.9+). */
public final class SoulMc {

    private SoulMc() {
    }

    public static String username() {
        return MinecraftClient.getInstance().getSession().getUsername();
    }

    /** Copies text to the system clipboard — the menu's copy-on-tap tiles. */
    public static void copy(String text) {
        MinecraftClient.getInstance().keyboard.setClipboard(text);
    }

    public static boolean mouseDown() {
        MinecraftClient client = MinecraftClient.getInstance();
        return GLFW.glfwGetMouseButton(client.getWindow().getHandle(), GLFW.GLFW_MOUSE_BUTTON_LEFT)
                == GLFW.GLFW_PRESS;
    }

    public static String mcVersion() {
        return MinecraftClient.getInstance().getGameVersion();
    }

    public static void quit() {
        MinecraftClient.getInstance().scheduleStop();
    }

    public static String quitLabel() {
        return MinecraftClient.getInstance().isInSingleplayer() ? "Save and Quit to Title" : "Disconnect";
    }

    public static void saveAndQuit(MinecraftClient client) {
        client.disconnect(ScreenTexts.returnToMenuOrDisconnect(client.isInSingleplayer()));
    }

    /** All keybinds in registration order — Soul keybind screen input. */
    public static KeyBinding[] allBinds() {
        return MinecraftClient.getInstance().options.allKeys;
    }

    /** Localized action name ("Forward", "Jump", …). */
    public static String bindAction(KeyBinding bind) {
        return KeyBinding.getLocalizedName(bind.getId()).get().getString();
    }

    /** Localized category name ("Movement", …). */
    public static String bindCategory(KeyBinding bind) {
        return bind.getCategory().getLabel().getString();
    }

    /** Current binding as the user sees it in vanilla options. */
    public static String bindName(KeyBinding bind) {
        return bind.isUnbound() ? "UNBOUND" : bind.getBoundKeyLocalizedText().getString();
    }

    public static boolean isKeyDown(int code) {
        MinecraftClient client = MinecraftClient.getInstance();
        return GLFW.glfwGetKey(client.getWindow().getHandle(), code) == GLFW.GLFW_PRESS;
    }

    /** Rebinds through the vanilla path so the action map and config stay in sync. */
    public static void bindKey(KeyBinding bind, int code) {
        bind.setBoundKey(InputUtil.Type.KEYSYM.createFromCode(code));
        KeyBinding.updateKeysByCode();
        MinecraftClient.getInstance().options.write();
    }

    public static void openMods(Screen parent) {
        try {
            Class<?> cls = Class.forName("com.terraformersmc.modmenu.gui.ModsScreen");
            Constructor<?> ctor = cls.getConstructor(Screen.class);
            MinecraftClient.getInstance().setScreen((Screen) ctor.newInstance(parent));
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

    /** Invert-Vertical-Mouse — renamed from getInvertYMouse in 1.21.10. */
    public static net.minecraft.client.option.SimpleOption<Boolean> invertY() {
        return MinecraftClient.getInstance().options.getInvertMouseY();
    }

    /**
     * The fullscreen option only stores intent; the window owns the real
     * state, so reconcile the two instead of blindly toggling.
     */
    public static void applyFullscreen(boolean on) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.getWindow().isFullscreen() != on) {
            client.getWindow().toggleFullscreen();
        }
    }

    public static void registerMenuKey(Runnable onPress) {
        KeyBinding key = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.soulclient.menu",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_RIGHT_SHIFT,
                KeyBinding.Category.create(Identifier.of("soulclient", "main"))
        ));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (key.wasPressed()) {
                onPress.run();
            }
        });
    }
}
