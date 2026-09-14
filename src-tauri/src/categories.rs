//! Category persistence: Spaces in the same category share one set of game
//! settings (`options.txt`) and one in-game server list (`servers.dat`).
//!
//! Storage layout (on disk, under the launcher data root):
//!   `categories/<category_id>/shared/servers.dat`
//!   `categories/<category_id>/shared/options.txt`
//!   `spaces/<space_id>/servers.dat`  -> symlink to shared (or copy fallback)
//!   `spaces/<space_id>/options.txt`  -> symlink to shared (or copy fallback)
//!
//! How sharing works:
//!   * When a Space joins a category, its files seed the shared folder (if empty)
//!     and are then REPLACED by symlinks to the shared files. Every member
//!     literally opens the same file, so in-game adds/deletes/reorders persist
//!     instantly across the category with zero copying.
//!   * On Windows without symlink privilege (no Dev Mode / admin), we fall back
//!     to atomic copy push (before launch) + pull (after exit). Same result,
//!     just not instant while the game runs.
//!   * `servers.dat` is gzipped NBT — see `servers_dat.rs` for the real parser.
//!     `options.txt` is `key:value` text. Both are validated on write so a bad
//!     edit can never corrupt the shared truth.

use crate::servers_dat;
use crate::spaces::{category_members, space_dir, Space, SpaceCategory};
use std::path::PathBuf;

/// Files shared across a category.
pub const SHARED_FILES: [&str; 2] = ["options.txt", "servers.dat"];

pub fn categories_root(root: &PathBuf) -> PathBuf {
    root.join("categories")
}

pub fn shared_dir(root: &PathBuf, category_id: &str) -> PathBuf {
    categories_root(root).join(category_id).join("shared")
}

/// Atomic file copy: write to `<dest>.tmp` then rename over the target.
fn copy_atomic(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = to.with_extension("tmp");
    // Follow symlinks on read: if `from` is a link into shared, this copies
    // the real bytes — exactly what we want for seed/pull.
    std::fs::copy(from, &tmp).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, to).map_err(|e| e.to_string())?;
    Ok(())
}

/// Ensure a Space's two files are symlinks into its category's shared folder.
/// Returns "symlink", "copy" (fallback), or "none" (no category).
/// Newly added / drag-dropped spaces call this automatically — no manual setup.
pub fn ensure_category_links(root: &PathBuf, space: &Space) -> Result<String, String> {
    let Some(cat) = &space.category_id else {
        return Ok("none".into());
    };
    if cat.trim().is_empty() {
        return Ok("none".into());
    }
    let shared = shared_dir(root, cat);
    std::fs::create_dir_all(&shared).map_err(|e| e.to_string())?;
    let dest_root = space_dir(root, &space.id);
    std::fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    // Seed shared from this space if shared is empty (first member wins).
    seed_shared_from_space(root, space)?;

    // Ensure shared files exist (even empty) so symlinks always have a target.
    for file in SHARED_FILES {
        let s = shared.join(file);
        if !s.exists() {
            if file == "servers.dat" {
                servers_dat::write_servers_dat(&s, &[])?;
            } else {
                servers_dat::write_options_txt(&s, &[])?;
            }
        }
    }

    let mut mode = "symlink";
    for file in SHARED_FILES {
        let m = servers_dat::link_or_copy(&shared.join(file), &dest_root.join(file))?;
        if m == "copy" {
            mode = "copy";
        }
    }
    Ok(mode.into())
}

/// Push shared files into a Space right before launch.
/// Symlinked members need no copy (they already ARE the shared file);
/// copy-fallback members get an atomic overwrite.
pub fn push_shared_into_space(root: &PathBuf, space: &Space) -> Result<(), String> {
    let Some(cat) = &space.category_id else {
        return Ok(());
    };
    // Upgrade to symlinks when possible (cheap, idempotent).
    let _ = ensure_category_links(root, space);
    let shared = shared_dir(root, cat);
    let dest_root = space_dir(root, &space.id);
    for file in SHARED_FILES {
        let from = shared.join(file);
        let to = dest_root.join(file);
        if !from.is_file() {
            continue;
        }
        if servers_dat::is_linked_to(&to, &from) {
            continue; // same file — nothing to do
        }
        copy_atomic(&from, &to)?;
    }
    Ok(())
}

/// Pull a Space's files back into shared after the game closes.
/// Symlinked members are already shared (no-op); copy members overwrite shared.
pub fn pull_space_into_shared(root: &PathBuf, space: &Space) -> Result<(), String> {
    let Some(cat) = &space.category_id else {
        return Ok(());
    };
    let shared = shared_dir(root, cat);
    std::fs::create_dir_all(&shared).map_err(|e| e.to_string())?;
    let src_root = space_dir(root, &space.id);
    for file in SHARED_FILES {
        let from = src_root.join(file);
        let to = shared.join(file);
        if servers_dat::is_linked_to(&from, &to) {
            continue; // already the shared file
        }
        // Validate before accepting as new shared truth — a corrupt write
        // must never poison the whole category.
        if file == "servers.dat" {
            if from.is_file() {
                let servers = servers_dat::read_servers_dat(&from)?;
                servers_dat::write_servers_dat(&to, &servers)?;
            }
        } else if from.is_file() {
            let opts = servers_dat::read_options_txt(&from)?;
            servers_dat::write_options_txt(&to, &opts.entries)?;
        }
    }
    Ok(())
}

/// Seed a new category from a joining Space: empty shared slots take the
/// Space's current files as baseline.
pub fn seed_shared_from_space(root: &PathBuf, space: &Space) -> Result<(), String> {
    let Some(cat) = &space.category_id else {
        return Ok(());
    };
    let shared = shared_dir(root, cat);
    let src_root = space_dir(root, &space.id);
    for file in SHARED_FILES {
        let shared_file = shared.join(file);
        if !shared_file.exists() {
            let from = src_root.join(file);
            // Don't seed from a symlink pointing elsewhere.
            let is_link = std::fs::symlink_metadata(&from)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            if !is_link && from.is_file() {
                std::fs::create_dir_all(&shared).map_err(|e| e.to_string())?;
                // Validate on the way in.
                if file == "servers.dat" {
                    let servers = servers_dat::read_servers_dat(&from)?;
                    servers_dat::write_servers_dat(&shared_file, &servers)?;
                } else {
                    let opts = servers_dat::read_options_txt(&from)?;
                    servers_dat::write_options_txt(&shared_file, &opts.entries)?;
                }
            }
        }
    }
    Ok(())
}

/// Detach a Space from its category: symlinks become real standalone copies
/// so leaving never deletes the player's settings.
pub fn detach_space(root: &PathBuf, space_id: &str) -> Result<(), String> {
    let dir = space_dir(root, space_id);
    for file in SHARED_FILES {
        servers_dat::unlink_to_copy(&dir.join(file))?;
    }
    Ok(())
}

/// True when any Space of this category is currently running a game.
#[allow(dead_code)]
pub fn category_running(
    running: &std::collections::HashMap<String, bool>,
    all: &[Space],
    category_id: &str,
) -> bool {
    category_members(all, category_id)
        .iter()
        .any(|s| running.get(&s.id).copied().unwrap_or(false))
}

/// Delete a category's shared folder. Members are first materialized to copies.
pub fn remove_shared(root: &PathBuf, category_id: &str) {
    if let Ok(rd) = std::fs::read_dir(root.join("spaces")) {
        for entry in rd.flatten() {
            let sid = entry.file_name().to_string_lossy().to_string();
            let spaces = crate::spaces::load_spaces(root);
            if spaces.iter().any(|s| s.id == sid && s.category_id.as_deref() == Some(category_id)) {
                let _ = detach_space(root, &sid);
            }
        }
    }
    let _ = std::fs::remove_dir_all(categories_root(root).join(category_id));
}

/// Validate + create a category.
pub fn new_category(name: &str, color: &str) -> Result<SpaceCategory, String> {
    let clean: String = name.chars().filter(|c| !c.is_control()).take(32).collect();
    let clean = clean.trim().to_string();
    if clean.is_empty() {
        return Err("Give the category a name".into());
    }
    let color = if color.starts_with('#') && color.len() == 7 {
        color.to_string()
    } else {
        "#3ea1d9".to_string()
    };
    Ok(SpaceCategory {
        id: uuid::Uuid::new_v4().to_string(),
        name: clean,
        color,
        created_at: crate::spaces::now_secs(),
    })
}
