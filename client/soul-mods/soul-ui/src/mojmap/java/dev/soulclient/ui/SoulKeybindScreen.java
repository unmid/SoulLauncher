package dev.soulclient.ui;

import dev.soulclient.SoulBridge;
import dev.soulclient.SoulIcons;
import dev.soulclient.SoulTheme;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Soul keybinds (Minecraft 26.1+, official names) — categories down the side,
 * bindings in the content pane and a capture card while a key is being
 * pressed. Rebinding runs through the vanilla path (SoulMc.bindKey) so the
 * action map and options file stay authoritative; only the presentation is
 * ours.
 *
 * <p>Key capture polls GLFW directly instead of overriding key events, which
 * keeps this screen in the shared mapping-free tree (Screen input methods
 * differ between the yarn and official mappings).
 */
public class SoulKeybindScreen extends Screen {

    private static final int ROW_H_MAX = 36;
    private static final int ROW_GAP = 6;
    private static final int MAX_SLOTS = 10;
    private static final int HEADER_H = 66;
    private static final int FOOTER_H = 58;
    private static final int CAT_PITCH = 34;
    private static final int CAT_H = 30;
    private static final int CAT_GAP = 4;
    /** Amber used for shared-key warnings (same warning amber as soul-hud). */
    private static final int WARN = 0xFFFBBF24;

    private final Screen parent;

    private final List<String> cats = new ArrayList<>();
    private final List<KeyMapping> filtered = new ArrayList<>();
    private final List<SoulSkin.Skin> sidebar = new ArrayList<>();
    private final List<SoulSkin.Skin> slots = new ArrayList<>();
    private final List<SoulSkin.Skin> footer = new ArrayList<>();
    private final boolean[] keyWas = new boolean[GLFW.GLFW_KEY_LAST + 1];
    /** Localized captions refreshed on page/category/rebind — never per frame. */
    private final String[] slotAction = new String[MAX_SLOTS];
    private final String[] slotKey = new String[MAX_SLOTS];
    /** "also bound to …" partner text per visible row; null when the key is unique. */
    private final String[] slotConflict = new String[MAX_SLOTS];
    /** Bound-key code → action names sharing it; rebuilt on every refresh. */
    private final Map<Integer, List<String>> sharedKeys = new HashMap<>();
    private int sharedCount;
    /** Transient header warning after a rebind lands on an occupied key. */
    private String notice;
    private long noticeAt;

    private int cat;
    private int page;
    private int slotCount;
    private int catPitch = CAT_PITCH;
    private int catH = CAT_H;

    private boolean capturing;
    private KeyMapping captureBind;
    private int captureAge;

    private int winX;
    private int winY;
    private int winW;
    private int winH;
    private int sideW;
    private int contentX;
    private int contentW;
    private int rowsTop;
    private int rowH;
    private int footerTop;
    private float indicatorY;

    public SoulKeybindScreen(Screen parent) {
        super(Minecraft.getInstance(), Minecraft.getInstance().font,
                Component.literal("SOUL CONTROLS"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        sidebar.clear();
        slots.clear();
        footer.clear();

        winW = Math.min(680, Math.max(240, this.width - 24));
        winH = Math.min(HEADER_H + MAX_SLOTS * (ROW_H_MAX + ROW_GAP) - ROW_GAP + FOOTER_H,
                this.height - 16);
        winH = Math.max(160, winH);
        winX = (this.width - winW) / 2;
        winY = (this.height - winH) / 2;
        sideW = Math.min(156, Math.max(96, winW / 4));
        contentX = winX + sideW + 24;
        contentW = Math.max(60, winW - sideW - 48);
        rowsTop = winY + HEADER_H;
        footerTop = winY + winH - FOOTER_H;

        // How many binding rows the content column can show at once.
        int avail = footerTop - rowsTop - 8;
        slotCount = MAX_SLOTS;
        while (slotCount > 3 && (avail - (slotCount - 1) * ROW_GAP) / slotCount < 26) {
            slotCount--;
        }
        rowH = Math.max(26, Math.min(ROW_H_MAX, (avail - (slotCount - 1) * ROW_GAP) / slotCount));

        buildCats();
        filter();

        // Sidebar categories — compressed when the window is short.
        int sideAvail = footerTop - rowsTop;
        catPitch = CAT_PITCH;
        if (cats.size() * CAT_PITCH > sideAvail) {
            catPitch = Math.max(16, sideAvail / Math.max(1, cats.size()));
        }
        catH = Math.max(14, catPitch - CAT_GAP);
        for (int i = 0; i < cats.size(); i++) {
            int index = i;
            SoulSkin.Skin s = SoulSkin.build(cats.get(i), null,
                    winX + 12, rowsTop + i * catPitch, sideW - 24, catH, SoulSkin.SIDEBAR,
                    null, SoulTheme.R_BUTTON, i * 0.35f, b -> setCat(index));
            addWidget(s.button());
            sidebar.add(s);
        }
        indicatorY = rowsTop + cat * catPitch;

        // Binding rows — input-only skins, their own click starts a capture.
        for (int i = 0; i < MAX_SLOTS; i++) {
            int slot = i;
            SoulSkin.Skin s = SoulSkin.build("", null,
                    contentX, rowsTop + i * (rowH + ROW_GAP), contentW, rowH, SoulSkin.ROW,
                    null, SoulTheme.R_CARD, i * 0.3f, b -> pressSlot(slot));
            addWidget(s.button());
            slots.add(s);
        }

        // Footer: pagination when needed, Done always.
        int btnY = footerTop + 12;
        int doneW = Math.min(140, Math.max(80, contentW / 3));
        if (pages() > 1 && contentW >= 320) {
            addFooter("Prev", SoulSkin.GHOST, null, contentX, btnY, 74, 3.0f, b -> turn(-1));
            addFooter("Next", SoulSkin.GHOST, null, contentX + 82, btnY, 74, 3.05f, b -> turn(1));
        }
        addFooter("Done", SoulSkin.PRIMARY, SoulIcons.CHECK,
                contentX + contentW - doneW, btnY, doneW, 3.4f, b -> onClose());

        refresh();
    }

    private void addFooter(String label, int style, String[] icon, int x, int y, int w,
                           float order, Button.OnPress onPress) {
        SoulSkin.Skin s = SoulSkin.build(label, null, x, y, w, 32, style, icon,
                SoulTheme.R_BUTTON, order, onPress);
        addWidget(s.button());
        footer.add(s);
    }

    // ----------------------------------------------------------- data flow

    private void buildCats() {
        cats.clear();
        for (KeyMapping b : SoulMc.allBinds()) {
            String c = SoulMc.bindCategory(b);
            if (!cats.contains(c)) {
                cats.add(c);
            }
        }
        if (cats.isEmpty()) {
            cats.add("General");
        }
        if (cat >= cats.size()) {
            cat = 0;
        }
    }

    private void filter() {
        filtered.clear();
        String want = cats.get(cat);
        for (KeyMapping b : SoulMc.allBinds()) {
            if (SoulMc.bindCategory(b).equals(want)) {
                filtered.add(b);
            }
        }
        if (page >= pages()) {
            page = Math.max(0, pages() - 1);
        }
    }

    private int pages() {
        if (slotCount <= 0 || filtered.isEmpty()) {
            return 1;
        }
        return Math.max(1, (filtered.size() + slotCount - 1) / slotCount);
    }

    private void setCat(int index) {
        if (capturing) {
            return;
        }
        cat = index;
        page = 0;
        filter();
        refresh();
    }

    private void turn(int delta) {
        if (capturing) {
            return;
        }
        page = Math.max(0, Math.min(pages() - 1, page + delta));
        refresh();
    }

    private void pressSlot(int slot) {
        if (capturing) {
            return;
        }
        int idx = page * slotCount + slot;
        if (idx >= filtered.size()) {
            return;
        }
        startCapture(filtered.get(idx));
    }

    /** Syncs row captions and visibility with the current page. */
    private void refresh() {
        rebuildConflicts();
        int base = page * slotCount;
        for (int i = 0; i < slots.size(); i++) {
            SoulSkin.Skin s = slots.get(i);
            int idx = base + i;
            if (i < slotCount && idx < filtered.size()) {
                s.button().visible = true;
                KeyMapping bind = filtered.get(idx);
                slotAction[i] = SoulMc.bindAction(bind);
                slotKey[i] = SoulMc.bindName(bind);
                slotConflict[i] = conflictOthers(bind);
                s.label(slotAction[i]);
            } else {
                s.button().visible = false;
                slotConflict[i] = null;
            }
        }
    }

    /** Maps every bound key to the actions using it; unbound keys are skipped. */
    private void rebuildConflicts() {
        sharedKeys.clear();
        sharedCount = 0;
        for (KeyMapping b : SoulMc.allBinds()) {
            int code = SoulBridge.bindCode(b);
            if (code < 0 || SoulMc.bindName(b).equals("UNBOUND")) {
                continue;
            }
            List<String> names = sharedKeys.get(code);
            if (names == null) {
                names = new ArrayList<>();
                sharedKeys.put(code, names);
            }
            names.add(SoulMc.bindAction(b));
        }
        for (List<String> names : sharedKeys.values()) {
            if (names.size() > 1) {
                sharedCount++;
            }
        }
    }

    /** Comma-joined actions sharing this bind's key, or null when it is unique. */
    private String conflictOthers(KeyMapping self) {
        List<String> names = sharedKeys.get(SoulBridge.bindCode(self));
        if (names == null || names.size() < 2) {
            return null;
        }
        String me = SoulMc.bindAction(self);
        StringBuilder others = new StringBuilder();
        for (String n : names) {
            if (n.equals(me)) {
                continue;
            }
            if (others.length() > 0) {
                others.append(", ");
            }
            others.append(n);
        }
        return others.length() > 0 ? others.toString() : null;
    }

    // ------------------------------------------------------------- capture

    private void startCapture(KeyMapping bind) {
        capturing = true;
        captureBind = bind;
        captureAge = 0;
        for (int code = GLFW.GLFW_KEY_SPACE; code <= GLFW.GLFW_KEY_LAST; code++) {
            keyWas[code] = SoulMc.isKeyDown(code);
        }
    }

    private void cancelCapture() {
        capturing = false;
        captureBind = null;
    }

    private void finishCapture(int code) {
        SoulMc.bindKey(captureBind, code);
        String action = SoulMc.bindAction(captureBind);
        String keyName = SoulMc.bindName(captureBind);
        cancelCapture();
        refresh();
        // Surface the collision immediately: the row dot is persistent, this
        // header note names the actions that now share the fresh key.
        List<String> names = sharedKeys.get(code);
        if (names != null && names.size() > 1) {
            StringBuilder others = new StringBuilder();
            for (String n : names) {
                if (n.equals(action)) {
                    continue;
                }
                if (others.length() > 0) {
                    others.append(", ");
                }
                others.append(n);
            }
            if (others.length() > 0) {
                notice = keyName + " ALSO USED BY " + others;
                noticeAt = System.currentTimeMillis();
            }
        }
    }

    /** Edge-triggered GLFW scan — also handles ESC-cancel and click-cancel. */
    private void pollCapture() {
        if (!capturing) {
            return;
        }
        captureAge++;
        for (int code = GLFW.GLFW_KEY_SPACE; code <= GLFW.GLFW_KEY_LAST; code++) {
            boolean down = SoulMc.isKeyDown(code);
            boolean was = keyWas[code];
            keyWas[code] = down;
            if (down && !was) {
                if (code == GLFW.GLFW_KEY_ESCAPE) {
                    cancelCapture();
                } else {
                    finishCapture(code);
                }
                return;
            }
        }
        // A fresh deliberate click backs out; the click that opened the card
        // has already been released by the time capture starts.
        if (captureAge > 3 && SoulMc.mouseDown()) {
            cancelCapture();
        }
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return !capturing;
    }

    @Override
    public void onClose() {
        Minecraft minecraft = Minecraft.getInstance();
        minecraft.options.save();
        if (parent != null) {
            minecraft.setScreen(parent);
        } else {
            minecraft.setScreen(null);
        }
    }

    // -------------------------------------------------------------- render

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
        float dt = Math.min(delta, 0.1f);
        pollCapture();

        extractBlurredBackground(g);
        g.fill(0, 0, this.width, this.height, 0x8005070B);

        // Window chrome
        SoulPaint.shadow(g, winX, winY, winW, winH, SoulTheme.R_WINDOW, 7, 0xB8000000);
        SoulPaint.roundRect(g, winX, winY, winW, winH, SoulTheme.R_WINDOW, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(g, winX, winY, winW, winH, SoulTheme.R_WINDOW, SoulTheme.LINE_STRONG);
        SoulPaint.roundRect(g, winX + 1, winY + 1, winW - 2, 1, 1, SoulTheme.GLOSS);

        // Sidebar column
        SoulPaint.roundRect(g, winX + 1, winY + 1, sideW, winH - 2, SoulTheme.R_WINDOW, SoulTheme.SIDEBAR);
        g.fill(winX + sideW - SoulTheme.R_WINDOW, winY + 1, winX + sideW, winY + winH - 1,
                SoulTheme.SIDEBAR);
        g.fill(winX + sideW, winY + SoulTheme.R_WINDOW, winX + sideW + 1,
                winY + winH - SoulTheme.R_WINDOW, SoulTheme.LINE_SOFT);

        SoulTex.logo(g, winX + 20, winY + 18, 24);
        SoulPaint.tracked(g, this.font, "SOUL", winX + 52, winY + 26, SoulTheme.TEXT);
        SoulPaint.divider(g, winX + 16, winY + 54, sideW - 32, SoulTheme.LINE_SOFT);

        if (winH - 26 > 180 + 6) {
            String user = SoulMc.username();
            int uw = this.font.width(user);
            SoulPaint.pill(g, winX + sideW - uw - 30, winY + winH - 26, uw + 22, 18, SoulTheme.CARD);
            SoulPaint.text(g, this.font, user, winX + sideW - uw - 19, winY + winH - 22,
                    SoulTheme.TEXT_FAINT);
        }

        // Sliding category indicator
        float targetY = rowsTop + cat * catPitch + Math.max(0, (catH - 22) / 2);
        indicatorY = SoulTheme.approach(indicatorY, targetY, 16f, dt);
        int indH = Math.min(22, catH);
        g.fill(winX + 12, (int) indicatorY, winX + 14, (int) indicatorY + indH, SoulTheme.ACCENT);
        SoulPaint.accentGlow(g, winX + 12, (int) indicatorY, 2, indH, 1, 0.7f);

        // Header
        SoulPaint.display(g, this.font, "CONTROLS", contentX, winY + 24, 1.6f, SoulTheme.TEXT);
        int catX = contentX + SoulPaint.displayWidth(this.font, "CONTROLS", 1.6f) + 12;
        int catW = SoulPaint.tracked(g, this.font, cats.get(cat).toUpperCase(),
                catX, winY + 30, SoulTheme.TEXT_FAINT);
        drawHeadNote(g, catX + catW, mouseX, mouseY);
        SoulPaint.divider(g, contentX, winY + 54, contentW, SoulTheme.LINE_SOFT);

        drawRows(g, mouseX, mouseY);

        SoulPaint.divider(g, contentX, footerTop + 2, contentW, SoulTheme.LINE_SOFT);

        // Page indicator sits between the pagination buttons and Done.
        if (pages() > 1 && contentW >= 320) {
            String t = "PAGE " + (page + 1) + " / " + pages();
            int tw = this.font.width(t);
            SoulPaint.text(g, this.font, t,
                    contentX + contentW - Math.min(140, Math.max(80, contentW / 3)) - 12 - tw,
                    footerTop + 24, SoulTheme.TEXT_FAINT);
        }

        super.extractRenderState(g, mouseX, mouseY, delta);

        for (SoulSkin.Skin s : sidebar) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
        }
        for (SoulSkin.Skin s : slots) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
        }
        for (SoulSkin.Skin s : footer) {
            SoulSkin.draw(g, this.font, s, dt, mouseX, mouseY);
        }

        if (capturing) {
            drawCaptureCard(g, mouseX, mouseY);
        }
    }

    /**
     * Right-aligned amber header note, in priority order: a fresh rebind
     * warning for ~5s, the hovered conflict's partner actions, then the live
     * count of keys currently shared by several actions. Skipped when the
     * category label already occupies the space.
     */
    private void drawHeadNote(GuiGraphicsExtractor g, int afterCategory, int mouseX, int mouseY) {
        String note = notice != null && System.currentTimeMillis() - noticeAt < 5000 ? notice : null;
        if (notice != null && note == null) {
            notice = null;
        }
        if (note == null) {
            note = hoveredConflict(mouseX, mouseY);
        }
        if (note == null && sharedCount > 0) {
            note = sharedCount + " SHARED KEYS";
        }
        if (note == null) {
            return;
        }
        int room = contentX + contentW - afterCategory - 16;
        if (room < 40) {
            return;
        }
        String full = note;
        while (note.length() > 1 && this.font.width(note) > room) {
            note = note.substring(0, note.length() - 1);
        }
        if (!note.equals(full)) {
            note = (note.length() > 1 ? note.substring(0, note.length() - 1) : "") + "…";
        }
        SoulPaint.text(g, this.font, note,
                contentX + contentW - this.font.width(note), winY + 30, WARN);
    }

    /** "ALSO USED BY …" for the conflicted row under the cursor, else null. */
    private String hoveredConflict(int mouseX, int mouseY) {
        if (mouseX < contentX - 4 || mouseX >= contentX + contentW + 4) {
            return null;
        }
        int base = page * slotCount;
        for (int i = 0; i < slotCount && base + i < filtered.size(); i++) {
            int y = rowsTop + i * (rowH + ROW_GAP);
            if (mouseY >= y && mouseY < y + rowH && slotConflict[i] != null) {
                return "ALSO USED BY " + slotConflict[i];
            }
        }
        return null;
    }

    private void drawRows(GuiGraphicsExtractor g, int mouseX, int mouseY) {
        int rx = contentX - 4;
        int rw = contentW + 8;
        int base = page * slotCount;
        for (int i = 0; i < slotCount; i++) {
            int idx = base + i;
            if (idx >= filtered.size()) {
                break;
            }
            int y = rowsTop + i * (rowH + ROW_GAP);
            boolean hover = mouseX >= rx && mouseX < rx + rw && mouseY >= y && mouseY < y + rowH;
            boolean held = capturing && captureBind == filtered.get(idx);
            int labelY = y + (rowH - 8) / 2;

            if (held) {
                SoulPaint.roundRect(g, rx, y, rw, rowH, SoulTheme.R_CARD,
                        SoulTheme.scaleAlpha(SoulTheme.ACCENT_SOFT, 0.8f));
                g.fill(rx + 1, y + 6, rx + 3, y + rowH - 6, SoulTheme.ACCENT);
            } else if (hover) {
                SoulPaint.roundRect(g, rx, y, rw, rowH, SoulTheme.R_CARD,
                        SoulTheme.scaleAlpha(SoulTheme.CARD_HOVER, 0.7f));
                g.fill(rx + 1, y + 6, rx + 3, y + rowH - 6, SoulTheme.ACCENT);
            }
            SoulPaint.divider(g, contentX, y + rowH + ROW_GAP / 2 - 1, contentW, SoulTheme.LINE_SOFT);

            // Right-aligned current binding (the action name is the row skin's label).
            // Shared keys get an amber dot and amber text so collisions read at a glance.
            boolean conflict = slotConflict[i] != null && !held;
            String key = held ? "..." : slotKey[i];
            int kw = this.font.width(key);
            int kx = contentX + contentW - 12 - kw;
            int nameW = this.font.width(slotAction[i]);
            if (kx > contentX + 12 + nameW + 8 + (conflict ? 10 : 0)) {
                if (conflict) {
                    SoulPaint.roundRect(g, kx - 10, labelY + 1, 6, 6, 3, WARN);
                }
                SoulPaint.text(g, this.font, key, kx, labelY,
                        held ? SoulTheme.ACCENT : conflict ? WARN : hover ? SoulTheme.TEXT : SoulTheme.TEXT_FAINT);
            }
        }
    }

    private void drawCaptureCard(GuiGraphicsExtractor g, int mouseX, int mouseY) {
        g.fill(0, 0, this.width, this.height, 0x6605070B);
        int cw = Math.min(340, this.width - 40);
        int ch = 116;
        int cx = (this.width - cw) / 2;
        int cy = (this.height - ch) / 2;

        SoulPaint.shadow(g, cx, cy, cw, ch, SoulTheme.R_WINDOW, 8, 0xC8000000);
        SoulPaint.roundRect(g, cx, cy, cw, ch, SoulTheme.R_WINDOW, SoulTheme.WINDOW);
        SoulPaint.roundRectOutline(g, cx, cy, cw, ch, SoulTheme.R_WINDOW, SoulTheme.ACCENT);

        float pulse = 0.55f + 0.45f * (float) Math.sin(System.currentTimeMillis() / 220.0);
        String title = "PRESS A KEY";
        int tw = SoulPaint.displayWidth(this.font, title, 1.4f);
        SoulPaint.display(g, this.font, title, cx + (cw - tw) / 2, cy + 22, 1.4f,
                SoulTheme.mix(SoulTheme.TEXT, SoulTheme.ACCENT, pulse));
        SoulPaint.accentGlow(g, cx + (cw - tw) / 2, cy + 44, tw, 2, 1, 0.5f + 0.5f * pulse);

        if (captureBind != null) {
            String action = SoulMc.bindAction(captureBind);
            int aw = this.font.width(action);
            SoulPaint.text(g, this.font, action, cx + (cw - aw) / 2, cy + 56,
                    SoulTheme.TEXT);
        }
        String hint = "ESC or click to cancel";
        int hw = this.font.width(hint);
        SoulPaint.text(g, this.font, hint, cx + (cw - hw) / 2, cy + 82,
                SoulTheme.TEXT_FAINT);
    }
}
