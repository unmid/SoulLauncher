package dev.soulclient;

import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

/**
 * Reflection bridge to optional sibling mods (soul-hud). Lives in the
 * mapping-free source set so every Minecraft version shares one copy and a
 * missing mod degrades to a typed state instead of a string guess.
 */
public final class SoulBridge {

    private static final String HUD_CLASS = "dev.soulclient.hud.SoulHud";
    /** Vanilla keeps the current key in a protected field: yarn `boundKey`, official `key`. */
    private static final String[] BIND_KEY_FIELDS = {"boundKey", "key"};
    private static final Map<Class<?>, Field> BIND_KEY_LOOKUP = new HashMap<>();

    private SoulBridge() {
    }

    public static boolean hudInstalled() {
        return find(HUD_CLASS) != null;
    }

    /** False when the HUD mod is absent or its state could not be read. */
    public static boolean hudEnabled() {
        try {
            Class<?> cls = find(HUD_CLASS);
            if (cls == null) {
                return false;
            }
            return (Boolean) cls.getField("visible").get(null);
        } catch (Throwable t) {
            return false;
        }
    }

    public static void toggleHud() {
        try {
            Class<?> cls = find(HUD_CLASS);
            if (cls != null) {
                cls.getMethod("toggle").invoke(null);
            }
        } catch (Throwable ignored) {
        }
    }

    /** Human-readable state for labels that need a sentence, not a boolean. */
    public static String hudLabel() {
        if (!hudInstalled()) {
            return "Soul HUD: not installed";
        }
        return "Soul HUD: " + (hudEnabled() ? "ON (F6)" : "OFF (F6)");
    }

    /**
     * Live "144 FPS · 100 64 -200 · 42 ms" readout line rendered by soul-hud,
     * or null when the HUD mod is absent (callers fall back to static copy).
     */
    public static String readouts() {
        try {
            Class<?> cls = find(HUD_CLASS);
            if (cls == null) {
                return null;
            }
            return (String) cls.getMethod("readouts").invoke(null);
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * GLFW code of a KeyBinding's <em>current</em> key. No mapping exposes a
     * public getter (yarn: private/protected {@code boundKey}; official:
     * protected {@code key}), so read the field reflectively and normalize the
     * key object's accessor ({@code getCode} in yarn, {@code getValue}
     * officially). Returns -1 when unknown or unbound.
     */
    public static int bindCode(Object bind) {
        if (bind == null) {
            return -1;
        }
        try {
            Field field = BIND_KEY_LOOKUP.get(bind.getClass());
            if (field == null) {
                for (String name : BIND_KEY_FIELDS) {
                    try {
                        field = bind.getClass().getDeclaredField(name);
                        break;
                    } catch (NoSuchFieldException ignored) {
                    }
                }
                if (field == null) {
                    return -1;
                }
                field.setAccessible(true);
                BIND_KEY_LOOKUP.put(bind.getClass(), field);
            }
            Object key = field.get(bind);
            if (key == null) {
                return -1;
            }
            try {
                return (Integer) key.getClass().getMethod("getCode").invoke(key);
            } catch (NoSuchMethodException yarnName) {
                return (Integer) key.getClass().getMethod("getValue").invoke(key);
            }
        } catch (Throwable t) {
            return -1;
        }
    }

    private static Class<?> find(String name) {
        try {
            return Class.forName(name);
        } catch (Throwable t) {
            return null;
        }
    }
}
