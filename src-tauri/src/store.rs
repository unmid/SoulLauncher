use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn default_ram() -> u32 {
    4
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_ram")]
    pub ram_gb: u32,
    #[serde(default)]
    pub show_snapshots: bool,
    /// Hide the launcher window while the game runs (on by default).
    #[serde(default = "default_true")]
    pub close_on_play: bool,
    #[serde(default)]
    pub extra_jvm_args: String,
    #[serde(default)]
    pub active_account_id: Option<String>,

    // --- launcher look & feel ------------------------------------------------
    /// UI theme: "dark" (default) or "light".
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Accent color for the UI (hex).
    #[serde(default = "default_accent")]
    pub accent: String,
    /// Background music from the musics folder.
    #[serde(default = "default_true")]
    pub music: bool,
    /// Music volume 0.0 - 1.0.
    #[serde(default = "default_music_volume")]
    pub music_volume: f32,
    /// UI animations (turn off for a snappier plain UI).
    #[serde(default = "default_true")]
    pub animations: bool,
    /// Wallpaper slideshow background.
    #[serde(default = "default_true")]
    pub wallpapers: bool,

    // --- optimization ----------------------------------------------------------
    /// off | balanced | performance
    #[serde(default)]
    pub optimize_mode: String,
    /// Apply optimize presets automatically on every launch.
    #[serde(default)]
    pub optimize_auto: bool,
    /// Render distance used by the optimize presets.
    #[serde(default = "default_rd")]
    pub optimize_render_distance: u32,

    /// Remote content (home page + server list) URLs.
    #[serde(default = "default_remote_base")]
    pub remote_base: String,
    /// Space currently selected in the bottom bar.
    #[serde(default)]
    pub selected_space_id: Option<String>,
}

fn default_accent() -> String {
    "#f26a3c".into()
}
fn default_music_volume() -> f32 {
    0.35
}
fn default_theme() -> String {
    "dark".into()
}
fn default_rd() -> u32 {
    10
}
fn default_remote_base() -> String {
    "https://api.github.com/repos/unmid/SoulLauncher/contents".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ram_gb: default_ram(),
            show_snapshots: false,
            close_on_play: true,
            extra_jvm_args: String::new(),
            active_account_id: None,
            theme: default_theme(),
            accent: default_accent(),
            music: true,
            music_volume: default_music_volume(),
            animations: true,
            wallpapers: true,
            optimize_mode: "off".into(),
            optimize_auto: false,
            optimize_render_distance: default_rd(),
            remote_base: default_remote_base(),
            selected_space_id: None,
        }
    }
}

/// Root folder where everything (game files, spaces, accounts) lives.
/// Upgrades from Orbit Launcher builds carry their data over automatically:
/// the first Soul start renames the old folder in place — no re-downloads.
pub fn data_root() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let soul = base.join("SoulLauncher");
    if !soul.exists() {
        let legacy = base.join("OrbitLauncher");
        if legacy.exists() {
            let _ = fs::rename(&legacy, &soul);
        }
    }
    soul
}

pub fn ensure_dirs(root: &PathBuf) -> std::io::Result<()> {
    for sub in [
        "",
        "libraries",
        "assets",
        "assets/objects",
        "assets/indexes",
        "versions",
        "runtimes",
        "natives",
        "spaces",
        "cache",
        "logs",
    ] {
        fs::create_dir_all(root.join(sub))?;
    }
    Ok(())
}

pub fn load_json<T: DeserializeOwned>(path: &PathBuf) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    let data = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn settings_path(root: &PathBuf) -> PathBuf {
    root.join("settings.json")
}

pub fn load_settings(root: &PathBuf) -> Settings {
    load_json(&settings_path(root)).unwrap_or_default()
}

pub fn save_settings(root: &PathBuf, settings: &Settings) -> Result<(), String> {
    save_json(&settings_path(root), settings)
}
