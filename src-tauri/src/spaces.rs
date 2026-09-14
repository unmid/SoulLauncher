//! "Spaces" = isolated Minecraft instances. Each space has its own mods, saves,
//! resource packs and options, so switching between modded versions is one click.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceMod {
    pub project_id: String,
    pub title: String,
    #[serde(default)]
    pub icon_url: String,
    #[serde(default)]
    pub version_number: String,
    #[serde(default)]
    pub file_name: String,
    /// mod | resourcepack | shader | datapack
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Datapacks live per-world (saves/<world>/datapacks); None = space library.
    #[serde(default)]
    pub world: Option<String>,
}

fn default_kind() -> String {
    "mod".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    /// emoji shown on the card
    pub icon: String,
    pub color: String,
    pub mc_version: String,
    /// vanilla | fabric | quilt | forge | neoforge
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    /// resolved version-json id once installed (e.g. "fabric-loader-0.16.9-1.21.1")
    #[serde(default)]
    pub installed_version_id: Option<String>,
    #[serde(default)]
    pub mods: Vec<SpaceMod>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub last_played: Option<u64>,
    #[serde(default)]
    pub ram_gb: Option<u32>,
    /// Shared persistence group: spaces in the same category share their
    /// game options (options.txt) and in-game server list (servers.dat).
    #[serde(default)]
    pub category_id: Option<String>,
    /// Desktop shortcut path when this Space is pinned (kept so unpin can
    /// remove the exact file, even after a rename).
    #[serde(default)]
    pub shortcut: Option<String>,
}

impl Space {
    #[allow(dead_code)] // constructor used by import flows
    pub fn new(name: &str, icon: &str, color: &str, mc_version: &str, loader: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            icon: icon.to_string(),
            color: color.to_string(),
            mc_version: mc_version.to_string(),
            loader: loader.to_string(),
            loader_version: None,
            installed_version_id: None,
            mods: Vec::new(),
            created_at: now_secs(),
            last_played: None,
            ram_gb: None,
            category_id: None,
            shortcut: None,
        }
    }
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn spaces_path(root: &PathBuf) -> PathBuf {
    root.join("spaces.json")
}

// ---------------------------------------------------------------------------
// Categories: groups of Spaces that share one set of game settings
// (options.txt) and one in-game server list (servers.dat). The first Space
// that plays while in a category becomes its "seed" — later launches copy
// the shared files into each member Space before the game starts.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceCategory {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub created_at: u64,
}

pub fn categories_path(root: &PathBuf) -> PathBuf {
    root.join("categories.json")
}

pub fn load_categories(root: &PathBuf) -> Vec<SpaceCategory> {
    crate::store::load_json(&categories_path(root)).unwrap_or_default()
}

pub fn save_categories(root: &PathBuf, cats: &[SpaceCategory]) -> Result<(), String> {
    crate::store::save_json(&categories_path(root), &cats.to_vec())
}

pub fn load_spaces(root: &PathBuf) -> Vec<Space> {
    crate::store::load_json(&spaces_path(root)).unwrap_or_default()
}

pub fn save_spaces(root: &PathBuf, spaces: &[Space]) -> Result<(), String> {
    crate::store::save_json(&spaces_path(root), &spaces.to_vec())
}

/// Every member Space of a category (order preserved as stored).
#[allow(dead_code)]
pub fn category_members(all: &[Space], category_id: &str) -> Vec<Space> {
    all.iter()
        .filter(|s| s.category_id.as_deref() == Some(category_id))
        .cloned()
        .collect()
}

pub fn space_dir(root: &PathBuf, space_id: &str) -> PathBuf {
    root.join("spaces").join(space_id)
}

pub fn space_mods_dir(root: &PathBuf, space_id: &str) -> PathBuf {
    space_dir(root, space_id).join("mods")
}

pub fn duplicate_space(root: &PathBuf, id: &str) -> Result<Space, String> {
    let mut spaces = load_spaces(root);
    let src = spaces
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or("Space not found")?;

    let mut copy = src.clone();
    copy.id = Uuid::new_v4().to_string();
    copy.name = format!("{} copy", src.name.trim_end_matches(" copy"));
    copy.created_at = now_secs();
    copy.last_played = None;

    // Copy the small stuff (mods, configs, resource packs) but not heavy worlds.
    for sub in ["mods", "config", "resourcepacks", "shaderpacks", "datapacks"] {
        let from = space_dir(root, &src.id).join(sub);
        let to = space_dir(root, &copy.id).join(sub);
        if from.exists() {
            let _ = copy_dir(&from, &to);
        }
    }

    spaces.push(copy.clone());
    save_spaces(root, &spaces)?;
    Ok(copy)
}

fn copy_dir(from: &PathBuf, to: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if ty.is_file() {
            let _ = std::fs::copy(entry.path(), &dest);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Export / import — a Space as a small shareable JSON file.
// The format is strict and declarative: it can describe WHAT to install but
// can never carry code, paths or commands, so a crafted file cannot do harm.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportMod {
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportedSpace {
    /// must equal EXPORT_MAGIC
    pub format: String,
    pub name: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub color: String,
    pub mc_version: String,
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub mods: Vec<ExportMod>,
    #[serde(default)]
    pub ram_gb: Option<u32>,
}

fn default_loader() -> String {
    "vanilla".to_string()
}

pub const EXPORT_MAGIC: &str = "soul-space/1";
/// Older exports written by Orbit Launcher builds still load.
pub const LEGACY_EXPORT_MAGIC: &str = "orbit-space/1";

pub fn export_space_json(space: &Space) -> ExportedSpace {
    ExportedSpace {
        format: EXPORT_MAGIC.into(),
        name: space.name.clone(),
        icon: space.icon.clone(),
        color: space.color.clone(),
        mc_version: space.mc_version.clone(),
        loader: space.loader.clone(),
        loader_version: space.loader_version.clone(),
        mods: space
            .mods
            .iter()
            .map(|m| {
                let mut parts = m.project_id.splitn(2, ':');
                let (source, id) = match (parts.next(), parts.next()) {
                    (Some(s), Some(id)) if s == "modrinth" || s == "curseforge" => {
                        (s.to_string(), id.to_string())
                    }
                    _ => ("modrinth".to_string(), m.project_id.clone()),
                };
                ExportMod {
                    source,
                    project_id: id,
                    title: m.title.chars().take(80).collect(),
                    kind: match m.kind.as_str() {
                        "resourcepack" | "shader" | "datapack" => m.kind.clone(),
                        _ => "mod".to_string(),
                    },
                }
            })
            .collect(),
        ram_gb: space.ram_gb,
    }
}

/// Strict sanitization: only known-safe values make it through.
/// Returns an error string describing the first problem.
pub fn validate_import(raw: &str) -> Result<ExportedSpace, String> {
    if raw.len() > 256 * 1024 {
        return Err("File is too big to be a Space".into());
    }
    let e: ExportedSpace =
        serde_json::from_str(raw).map_err(|_| "This is not a Soul Space file".to_string())?;
    if e.format != EXPORT_MAGIC && e.format != LEGACY_EXPORT_MAGIC {
        return Err("This is not a Soul Space file".into());
    }
    ok_text(&e.name, 32, "name")?;
    if !crate::loaders::LOADER_KINDS.contains(&e.loader.as_str()) {
        return Err("This Space uses unknown software".into());
    }
    ok_version(&e.mc_version)?;
    if let Some(lv) = &e.loader_version {
        ok_version(lv)?;
    }
    if !e.icon.is_empty() && e.icon.chars().count() > 24 {
        return Err("Icon looks wrong".into());
    }
    if !e.color.is_empty() && !valid_color(&e.color) {
        return Err("Color looks wrong".into());
    }
    if e.mods.len() > 300 {
        return Err("Too many entries".into());
    }
    for m in &e.mods {
        if !["modrinth", "curseforge", ""].contains(&m.source.as_str()) {
            return Err("Unknown content source".into());
        }
        if !["mod", "resourcepack", "shader", "datapack", ""].contains(&m.kind.as_str()) {
            return Err("Unknown content kind".into());
        }
        if m.project_id.len() > 64
            || !m
                .project_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err("A mod entry looks wrong".into());
        }
        ok_text(&m.title, 80, "mod title")?;
    }
    Ok(e)
}

fn ok_text(s: &str, max: usize, what: &str) -> Result<(), String> {
    if s.is_empty() || s.chars().count() > max {
        return Err(format!("Bad {what}"));
    }
    if s.chars().any(|c| c.is_control() && c != '\n') {
        return Err(format!("Bad {what}"));
    }
    Ok(())
}

fn ok_version(s: &str) -> Result<(), String> {
    if s.is_empty() || s.len() > 40 {
        return Err("Bad version".into());
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "._-+".contains(c))
    {
        return Err("Bad version".into());
    }
    Ok(())
}

fn valid_color(s: &str) -> bool {
    let s = s.strip_prefix('#').unwrap_or(s);
    s.len() == 6 && s.chars().all(|c| c.is_ascii_hexdigit())
}

