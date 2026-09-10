//! Storage breakdown + junk cleanup. Never touches worlds, mods or game files —
//! only installer caches, temp downloads and logs.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageItem {
    pub id: String,
    pub label: String,
    pub bytes: u64,
    pub junk: bool, // safe to delete with one click
    pub hint: String,
}

fn dir_size(path: &PathBuf) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![path.clone()];
    let mut budget = 40_000usize; // don't scan forever
    while let Some(dir) = stack.pop() {
        if budget == 0 {
            break;
        }
        budget -= 1;
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if let Ok(md) = entry.metadata() {
                    if md.is_dir() {
                        stack.push(p);
                    } else if md.is_file() {
                        total = total.saturating_add(md.len());
                    }
                }
            }
        }
    }
    total
}

pub fn breakdown(root: &PathBuf) -> Vec<StorageItem> {
    let mut items = Vec::new();
    let push = |items: &mut Vec<StorageItem>, id: &str, label: &str, path: PathBuf, junk: bool, hint: &str| {
        let bytes = dir_size(&path);
        items.push(StorageItem {
            id: id.into(),
            label: label.into(),
            bytes,
            junk,
            hint: hint.into(),
        });
    };

    push(
        &mut items,
        "spaces",
        "Your Spaces (worlds, mods, settings)",
        root.join("spaces"),
        false,
        "Everything you built. Delete a Space from the Spaces page instead.",
    );
    push(
        &mut items,
        "assets",
        "Game assets (sounds, textures)",
        root.join("assets"),
        false,
        "Needed by every version. Deleting forces a big re-download.",
    );
    push(
        &mut items,
        "libraries",
        "Game libraries",
        root.join("libraries"),
        false,
        "Needed to run Minecraft.",
    );
    push(
        &mut items,
        "versions",
        "Downloaded versions",
        root.join("versions"),
        false,
        "Needed to run Minecraft.",
    );
    push(
        &mut items,
        "runtimes",
        "Java runtimes",
        root.join("runtimes"),
        false,
        "Java used by Minecraft itself.",
    );
    push(
        &mut items,
        "cache",
        "Installer cache + temp files",
        root.join("cache"),
        true,
        "Safe junk: old installers and temp downloads.",
    );
    push(
        &mut items,
        "logs",
        "Game logs",
        root.clone(),
        true,
        "soul-game.log files left after playing. Safe to delete.",
    );
    items
}

/// Delete only junk. Returns freed bytes.
pub fn clean_junk(root: &PathBuf) -> u64 {
    let mut freed = 0u64;
    let cache = root.join("cache");
    freed += dir_size(&cache);
    let _ = std::fs::remove_dir_all(&cache);
    let _ = std::fs::create_dir_all(&cache);

    // remove per-space game logs + crash dumps
    if let Ok(spaces) = std::fs::read_dir(root.join("spaces")) {
        for space in spaces.flatten() {
            for name in ["soul-game.log", "orbit-game.log", "hs_err_pid1.log"] {
                let f = space.path().join(name);
                if let Ok(md) = f.metadata() {
                    if md.is_file() {
                        freed += md.len();
                        let _ = std::fs::remove_file(&f);
                    }
                }
            }
            let logs = space.path().join("logs");
            freed += dir_size(&logs);
            let _ = std::fs::remove_dir_all(&logs);
            let crash = space.path().join("crash-reports");
            freed += dir_size(&crash);
            let _ = std::fs::remove_dir_all(&crash);
        }
    }
    freed
}
