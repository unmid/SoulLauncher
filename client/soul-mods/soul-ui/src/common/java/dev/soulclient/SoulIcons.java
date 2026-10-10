package dev.soulclient;

/**
 * Pixel-art glyph masks shared by every mapping tree. Each mask is a row of
 * characters where '#' is ink. Masks are square-ish and drawn centred.
 */
public final class SoulIcons {
    private SoulIcons() {
    }

    public static final String[] PLAY = {
            "  #    ",
            "  ##   ",
            "  ###  ",
            "  #### ",
            "  ###  ",
            "  ##   ",
            "  #    ",
    };

    public static final String[] GLOBE = {
            " #### ",
            "#    #",
            "# ### ",
            "# ### ",
            "# ### ",
            "#    #",
            " #### ",
    };

    public static final String[] CUBE = {
            " ##### ",
            " #   # ",
            " #   # ",
            " #   # ",
            " #   # ",
            " #   # ",
            " ##### ",
    };

    public static final String[] GRID = {
            "## ##",
            "     ",
            "## ##",
            "     ",
            "## ##",
    };

    public static final String[] USER = {
            " ##### ",
            " #   # ",
            " #   # ",
            " ##### ",
            "  # #  ",
            " #   # ",
            "     # ",
    };

    public static final String[] GEAR = {
            " #  # ",
            "  #### ",
            " ##### ",
            "# ## #",
            " ##### ",
            "  #### ",
            " #  # ",
    };

    public static final String[] POWER = {
            "   #   ",
            "   #   ",
            " #   # ",
            " #   # ",
            " #   # ",
            "  ###  ",
            "   #   ",
    };

    public static final String[] SLIDERS = {
            "## ##",
            "     ",
            " #   ",
            "     ",
            "   # ",
            "     ",
            "#####",
    };

    public static final String[] COMPASS = {
            "  #  ",
            " #### ",
            "######",
            " ## ##",
            "######",
            " #### ",
            "  #  ",
    };

    public static final String[] SPARK = {
            "   #   ",
            "   #   ",
            " ##### ",
            "#######",
            " ##### ",
            "   #   ",
            "   #   ",
    };

    public static final String[] EYES = {
            "     ",
            "#####",
            "     ",
    };

    public static final String[] CHECK = {
            "     #",
            "     #",
            "    # ",
            "#  #  ",
            " ##   ",
            " #    ",
    };

    public static final String[] CHEVRON = {
            "#    ",
            " ##   ",
            "  ##  ",
            "   ## ",
            "    ##",
    };

    public static int maskWidth(String[] mask) {
        return mask[0].length();
    }

    public static int maskHeight(String[] mask) {
        return mask.length;
    }

    public static boolean lit(String[] mask, int x, int y) {
        if (y < 0 || y >= mask.length) {
            return false;
        }
        String row = mask[y];
        if (x < 0 || x >= row.length()) {
            return false;
        }
        return row.charAt(x) == '#';
    }
}
