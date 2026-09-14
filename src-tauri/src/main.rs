// Soul Launcher - Rust core
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod categories;
mod content;
mod download;
mod hardware;
mod jruntime;
mod launch;
mod loaders;
mod icongen;
mod modpack;
mod mojang;
mod profile;
mod remote;
mod servers;
mod servers_dat;
mod soulclient;
mod spaces;
mod storage;
mod store;
mod update;

use launch::ProgressSink;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    root: PathBuf,
    http: reqwest::Client,
    settings: Mutex<store::Settings>,
    running: Arc<Mutex<HashMap<String, bool>>>,
}

impl AppState {
    fn spaces(&self) -> Vec<spaces::Space> {
        spaces::load_spaces(&self.root)
    }
    fn persist_spaces(&self, spaces: &[spaces::Space]) -> Result<(), String> {
        spaces::save_spaces(&self.root, spaces)
    }
}

// ---------------------------------------------------------------------------
// basic state

#[tauri::command]
fn get_settings(state: State<AppState>) -> store::Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: store::Settings) -> Result<(), String> {
    store::save_settings(&state.root, &settings)?;
    *state.settings.lock().unwrap() = settings;
    Ok(())
}

// ---------------------------------------------------------------------------
// versions + loaders

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GameVersion {
    id: String,
    kind: String,
    release_time: String,
}

#[tauri::command]
async fn list_game_versions(state: State<'_, AppState>) -> Result<Vec<GameVersion>, String> {
    // Every kind is returned (release / snapshot / old_beta / old_alpha) — the
    // wizard filters client-side, so the Snapshots tab can never be a dead end
    // just because an unrelated setting is off.
    let manifest = mojang::fetch_manifest(&state.http).await?;
    Ok(manifest
        .into_iter()
        .map(|v| GameVersion {
            id: v.id,
            kind: v.kind,
            release_time: v.release_time,
        })
        .collect())
}

#[tauri::command]
async fn list_loader_versions(
    state: State<'_, AppState>,
    loader: String,
    mc_version: String,
) -> Result<Vec<String>, String> {
    match loader.as_str() {
        "fabric" => loaders::fabric_loader_versions(&state.http, &mc_version).await,
        "quilt" => loaders::quilt_loader_versions(&state.http, &mc_version).await,
        "forge" => loaders::forge_versions(&state.http, &mc_version).await,
        "neoforge" => loaders::neoforge_versions(&state.http, &mc_version).await,
        "optifine" => loaders::optifine_versions(&state.http, &mc_version).await,
        _ => Ok(vec![]),
    }
}

/// Versions already downloaded on this PC (versions/<id>/<id>.json exists).
#[tauri::command]
fn list_installed_versions(state: State<AppState>) -> Vec<String> {
    let dir = state.root.join("versions");
    let mut out: Vec<String> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    e.path().join(format!("{name}.json")).exists()
                })
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

// ---------------------------------------------------------------------------
// spaces CRUD

#[tauri::command]
fn list_spaces(state: State<AppState>) -> Vec<spaces::Space> {
    state.spaces()
}

#[tauri::command]
fn create_space(state: State<AppState>, mut space: spaces::Space) -> Result<spaces::Space, String> {
    if space.name.trim().is_empty() {
        return Err("Give your Space a name".into());
    }
    if !loaders::LOADER_KINDS.contains(&space.loader.as_str()) {
        return Err("Unknown software type".into());
    }
    if space.id.is_empty() {
        space.id = uuid::Uuid::new_v4().to_string();
    }
    if space.created_at == 0 {
        space.created_at = spaces::now_secs();
    }
    let mut all = state.spaces();
    all.push(space.clone());
    state.persist_spaces(&all)?;
    let _ = std::fs::create_dir_all(spaces::space_dir(&state.root, &space.id));
    Ok(space)
}

#[tauri::command]
fn update_space(state: State<AppState>, space: spaces::Space) -> Result<spaces::Space, String> {
    let mut all = state.spaces();
    let idx = all.iter().position(|s| s.id == space.id).ok_or("Space not found")?;
    let old = &all[idx];
    let mut next = space;
    if old.mc_version != next.mc_version
        || old.loader != next.loader
        || old.loader_version != next.loader_version
    {
        next.installed_version_id = None;
    } else {
        next.installed_version_id = old.installed_version_id.clone();
    }
    next.created_at = old.created_at;
    next.last_played = old.last_played;
    all[idx] = next.clone();
    state.persist_spaces(&all)?;
    Ok(next)
}

// ---------------------------------------------------------------------------
// desktop shortcuts: pin a Space so it can be launched straight from the
// desktop. The shortcut runs the app with `--space <id>`; the frontend reads
// launch_args on startup and plays that Space immediately.

fn shortcut_path(root: &PathBuf, space_name: &str) -> Result<std::path::PathBuf, String> {
    let desktop = dirs::desktop_dir().ok_or("Couldn't find the Desktop folder")?;
    let safe: String = space_name
        .chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string();
    let safe = if safe.is_empty() { "Space".to_string() } else { safe };
    let lnk = desktop.join(format!("Soul - {safe}.lnk"));
    // Two Spaces with the same name must not fight over one shortcut: if the
    // file already belongs to another Space, this one gets a tagged name.
    if lnk.exists() {
        let taken = spaces::load_spaces(root)
            .iter()
            .any(|s| s.shortcut.as_deref() == Some(lnk.to_string_lossy().as_ref()));
        if taken {
            let tag = uuid::Uuid::new_v4().simple().to_string()[..6].to_string();
            return Ok(desktop.join(format!("Soul - {safe} ({tag}).lnk")));
        }
    }
    Ok(lnk)
}

/// Run PowerShell without flashing a console window over the launcher.
fn run_hidden_powershell(script: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Windows wouldn't create the shortcut".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = script;
        Err("Desktop shortcuts are Windows-only".into())
    }
}

#[tauri::command]
fn pin_space_shortcut(state: State<AppState>, space_id: String) -> Result<String, String> {
    let all = state.spaces();
    let space = all.iter().find(|s| s.id == space_id).ok_or("Space not found")?.clone();
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let lnk = shortcut_path(&state.root, &space.name)?;
    let work = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    // The shortcut carries the same icon the Space shows inside the app.
    let icon = icongen::write_space_ico(&state.root, &space.id, &space.icon)
        .unwrap_or_else(|_| exe.clone());
    let ps = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $sc = $ws.CreateShortcut('{}'); \
         $sc.TargetPath = '{}'; \
         $sc.Arguments = '--space {}'; \
         $sc.WorkingDirectory = '{}'; \
         $sc.IconLocation = '{}'; \
         $sc.Description = 'Play {} in Soul Launcher'; \
         $sc.Save()",
        lnk.display(),
        exe.display(),
        space.id,
        work.display(),
        icon.display(),
        space.name.replace('\'', "''"),
    );
    run_hidden_powershell(&ps)?;

    // remember the exact path so a later unpin removes the right file
    let mut all = state.spaces();
    if let Some(slot) = all.iter_mut().find(|s| s.id == space_id) {
        slot.shortcut = Some(lnk.to_string_lossy().to_string());
        let _ = state.persist_spaces(&all);
    }
    Ok(lnk.to_string_lossy().to_string())
}

#[tauri::command]
fn unpin_space_shortcut(state: State<AppState>, space_id: String) -> Result<(), String> {
    let mut all = state.spaces();
    let space = all
        .iter_mut()
        .find(|s| s.id == space_id)
        .ok_or("Space not found")?
        .clone();
    // remove the recorded path first (it survives Space renames), then the
    // plain "Soul/Orbit - <name>" file an older build may have left behind.
    let mut removed = false;
    if let Some(path) = space.shortcut.clone() {
        if std::fs::remove_file(&path).is_ok() {
            removed = true;
        }
    }
    if !removed {
        let desktop = dirs::desktop_dir().ok_or("Couldn't find the Desktop folder")?;
        for name in [
            format!("Soul - {}.lnk", space.name),
            format!("Orbit - {}.lnk", space.name),
        ] {
            if std::fs::remove_file(desktop.join(&name)).is_ok() {
                break;
            }
        }
    }
    if let Some(slot) = all.iter_mut().find(|s| s.id == space_id) {
        slot.shortcut = None;
    }
    state.persist_spaces(&all)?;
    icongen::remove_space_ico(&state.root, &space_id);
    Ok(())
}

/// Arguments the app was started with (used for `--space <id>` desktop shortcuts).
#[tauri::command]
fn launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

#[tauri::command]
fn duplicate_space(state: State<AppState>, space_id: String) -> Result<spaces::Space, String> {
    spaces::duplicate_space(&state.root, &space_id)
}

#[tauri::command]
fn delete_space(state: State<AppState>, space_id: String, delete_files: bool) -> Result<(), String> {
    let mut all = state.spaces();
    all.retain(|s| s.id != space_id);
    state.persist_spaces(&all)?;
    if delete_files {
        let _ = std::fs::remove_dir_all(spaces::space_dir(&state.root, &space_id));
    }
    Ok(())
}

#[tauri::command]
fn open_space_folder(state: State<AppState>, space_id: String) -> Result<(), String> {
    let dir = spaces::space_dir(&state.root, &space_id);
    let _ = std::fs::create_dir_all(&dir);
    open::that(&dir).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// space export / import (safe shareable JSON)

#[tauri::command]
fn export_space(state: State<AppState>, space_id: String, path: String) -> Result<(), String> {
    let all = state.spaces();
    let space = all.iter().find(|s| s.id == space_id).ok_or("Space not found")?;
    let export = spaces::export_space_json(space);
    let data = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

/// Validate + create a new (empty) Space from an exported file, then
/// re-download its mods/resourcepacks/shaders in the background (best effort).
#[tauri::command]
fn import_space(state: State<AppState>, path: String) -> Result<spaces::Space, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Can't read the file: {e}"))?;
    let export = spaces::validate_import(&raw)?;
    let mc = export.mc_version.clone();
    let loader = export.loader.clone();
    let space = spaces::Space {
        id: uuid::Uuid::new_v4().to_string(),
        name: export.name.trim().to_string(),
        icon: if export.icon.is_empty() { "rocket".into() } else { export.icon },
        color: if export.color.is_empty() { "#5ac8fa".into() } else { format!("#{}", export.color.trim_start_matches('#')) },
        mc_version: export.mc_version,
        loader: export.loader,
        loader_version: export.loader_version,
        installed_version_id: None,
        mods: vec![],
        created_at: spaces::now_secs(),
        last_played: None,
        ram_gb: export.ram_gb,
        category_id: None,
        shortcut: None,
    };
    let mut all = state.spaces();
    all.push(space.clone());
    state.persist_spaces(&all)?;
    let _ = std::fs::create_dir_all(spaces::space_dir(&state.root, &space.id));

    if !export.mods.is_empty() {
        let http = state.http.clone();
        let root = state.root.clone();
        let sid = space.id.clone();
        let mods = export.mods.clone();
        tauri::async_runtime::spawn(async move {
            for m in mods {
                let source = if m.source.is_empty() { "modrinth".to_string() } else { m.source };
                let kind = if m.kind.is_empty() { "mod".to_string() } else { m.kind };
                if let Ok(installed) = content::install_content(&http, &root, &sid, &source, &kind, &m.project_id, &mc, &loader).await {
                    let mut all = spaces::load_spaces(&root);
                    if let Some(s) = all.iter_mut().find(|s| s.id == sid) {
                        s.mods.retain(|x| x.project_id != installed.project_id);
                        s.mods.push(installed);
                        let _ = spaces::save_spaces(&root, &all);
                    }
                }
            }
        });
    }
    Ok(space)
}

// ---------------------------------------------------------------------------
// categories: shared settings + server-list groups

#[tauri::command]
fn list_categories(state: State<AppState>) -> Vec<spaces::SpaceCategory> {
    spaces::load_categories(&state.root)
}

#[tauri::command]
fn create_category(state: State<AppState>, name: String, color: String) -> Result<spaces::SpaceCategory, String> {
    let cat = categories::new_category(&name, &color)?;
    let mut all = spaces::load_categories(&state.root);
    all.push(cat.clone());
    spaces::save_categories(&state.root, &all)?;
    Ok(cat)
}

#[tauri::command]
fn rename_category(state: State<AppState>, category_id: String, name: String, color: Option<String>) -> Result<(), String> {
    let clean: String = name.chars().filter(|c| !c.is_control()).take(32).collect();
    let clean = clean.trim().to_string();
    if clean.is_empty() {
        return Err("Give the category a name".into());
    }
    let mut all = spaces::load_categories(&state.root);
    let slot = all.iter_mut().find(|c| c.id == category_id).ok_or("Category not found")?;
    slot.name = clean;
    if let Some(c) = color {
        if c.starts_with('#') && c.len() == 7 {
            slot.color = c;
        }
    }
    spaces::save_categories(&state.root, &all)
}

/// Delete a category. Spaces keep their files but lose the shared link.
/// Symlinks are materialized to real copies first so no settings are lost.
#[tauri::command]
fn delete_category(state: State<AppState>, category_id: String) -> Result<(), String> {
    let mut cats = spaces::load_categories(&state.root);
    cats.retain(|c| c.id != category_id);
    spaces::save_categories(&state.root, &cats)?;
    let mut all = state.spaces();
    for s in all.iter_mut() {
        if s.category_id.as_deref() == Some(&category_id) {
            let _ = categories::detach_space(&state.root, &s.id);
            s.category_id = None;
        }
    }
    state.persist_spaces(&all)?;
    categories::remove_shared(&state.root, &category_id);
    Ok(())
}

/// Move a Space into a category (or out with None).
/// Joining auto-relinks `servers.dat` + `options.txt` to
/// `categories/<id>/shared/` via symlink (copy fallback) — no manual setup.
/// Leaving materializes symlinks back to standalone copies.
#[tauri::command]
fn set_space_category(state: State<AppState>, space_id: String, category_id: Option<String>) -> Result<spaces::Space, String> {
    if let Some(cid) = &category_id {
        if !cid.trim().is_empty() && !spaces::load_categories(&state.root).iter().any(|c| &c.id == cid) {
            return Err("Category not found".into());
        }
    }
    let clean = category_id.filter(|c| !c.trim().is_empty());
    let mut all = state.spaces();
    let leaving = {
        let cur = all.iter().find(|s| s.id == space_id).ok_or("Space not found")?;
        cur.category_id.is_some() && clean.is_none()
    };
    if leaving {
        categories::detach_space(&state.root, &space_id)?;
    }
    let space = all.iter_mut().find(|s| s.id == space_id).ok_or("Space not found")?;
    space.category_id = clean;
    let space = space.clone();
    if space.category_id.is_some() {
        categories::ensure_category_links(&state.root, &space)?;
    }
    state.persist_spaces(&all)?;
    Ok(space)
}

// ---------------------------------------------------------------------------
// Category shared files: real servers.dat (NBT) + options.txt editing.
// The frontend Category UI reads/writes the SHARED truth directly; symlinked
// members see it instantly because they open the same file.

#[tauri::command]
fn get_category_servers(state: State<AppState>, category_id: String) -> Result<Vec<servers_dat::CategoryServer>, String> {
    let path = categories::shared_dir(&state.root, &category_id).join("servers.dat");
    servers_dat::read_servers_dat(&path)
}

#[tauri::command]
fn set_category_servers(state: State<AppState>, category_id: String, servers: Vec<servers_dat::CategoryServer>) -> Result<(), String> {
    let path = categories::shared_dir(&state.root, &category_id).join("servers.dat");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    servers_dat::write_servers_dat(&path, &servers)?;
    // Copy-fallback members (no symlink privilege) get the update pushed now.
    for s in state.spaces().iter().filter(|s| s.category_id.as_deref() == Some(&category_id)) {
        let link = spaces::space_dir(&state.root, &s.id).join("servers.dat");
        if !servers_dat::is_linked_to(&link, &path) {
            let _ = std::fs::copy(&path, &link);
        }
    }
    Ok(())
}

#[tauri::command]
fn get_category_options(state: State<AppState>, category_id: String) -> Result<servers_dat::CategoryOptions, String> {
    let path = categories::shared_dir(&state.root, &category_id).join("options.txt");
    servers_dat::read_options_txt(&path)
}

#[tauri::command]
fn set_category_options(state: State<AppState>, category_id: String, entries: Vec<[String; 2]>) -> Result<(), String> {
    let path = categories::shared_dir(&state.root, &category_id).join("options.txt");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    servers_dat::write_options_txt(&path, &entries)?;
    for s in state.spaces().iter().filter(|s| s.category_id.as_deref() == Some(&category_id)) {
        let link = spaces::space_dir(&state.root, &s.id).join("options.txt");
        if !servers_dat::is_linked_to(&link, &path) {
            let _ = std::fs::copy(&path, &link);
        }
    }
    Ok(())
}

/// How is a Space currently linked? "symlink" | "copy" | "none" (+ per-file detail).
#[tauri::command]
fn space_link_status(state: State<AppState>, space_id: String) -> Result<serde_json::Value, String> {
    let all = state.spaces();
    let space = all.iter().find(|s| s.id == space_id).ok_or("Space not found")?;
    let Some(cat) = &space.category_id else {
        return Ok(serde_json::json!({ "mode": "none", "files": {} }));
    };
    let shared = categories::shared_dir(&state.root, cat);
    let dir = spaces::space_dir(&state.root, &space_id);
    let mut files = serde_json::Map::new();
    let mut any_copy = false;
    for f in categories::SHARED_FILES {
        let linked = servers_dat::is_linked_to(&dir.join(f), &shared.join(f));
        if !linked {
            any_copy = true;
        }
        files.insert(f.to_string(), serde_json::Value::Bool(linked));
    }
    Ok(serde_json::json!({ "mode": if any_copy { "copy" } else { "symlink" }, "files": files }))
}

/// Force re-link every member of a category (used after moves / repairs).
#[tauri::command]
fn relink_category(state: State<AppState>, category_id: String) -> Result<String, String> {
    let mut mode = "symlink".to_string();
    for s in state.spaces().iter().filter(|s| s.category_id.as_deref() == Some(&category_id)) {
        let m = categories::ensure_category_links(&state.root, s)?;
        if m == "copy" {
            mode = "copy".to_string();
        }
    }
    Ok(mode)
}

// ---------------------------------------------------------------------------
// content (mods / resource packs / shaders—Modrinth + CurseForge)

#[tauri::command]
async fn search_content(
    state: State<'_, AppState>,
    source: String,
    kind: String,
    query: String,
    mc_version: String,
    loader: String,
    sort: String,
    offset: u32,
) -> Result<serde_json::Value, String> {
    let (hits, total) = content::search_content(
        &state.http,
        &source,
        &kind,
        &query,
        &mc_version,
        &loader,
        if sort.is_empty() { "relevance" } else { &sort },
        offset,
    )
    .await?;
    Ok(serde_json::json!({ "hits": hits, "total": total }))
}

#[tauri::command]
async fn content_details(
    state: State<'_, AppState>,
    source: String,
    project_id: String,
) -> Result<content::ContentDetails, String> {
    content::content_details(&state.http, &source, &project_id).await
}

#[tauri::command]
async fn install_content(
    state: State<'_, AppState>,
    space_id: String,
    source: String,
    kind: String,
    project_id: String,
) -> Result<spaces::Space, String> {
    let mut all = state.spaces();
    let space = all
        .iter_mut()
        .find(|s| s.id == space_id)
        .ok_or("Space not found")?;
    let stored_id = format!("{source}:{project_id}");
    let previous: Vec<spaces::SpaceMod> = space.mods.iter()
        .filter(|m| m.project_id == stored_id || (!m.project_id.contains(':') && m.project_id == project_id))
        .cloned()
        .collect();
    let installed = content::install_content(
        &state.http,
        &state.root,
        &space_id,
        &source,
        &kind,
        &project_id,
        &space.mc_version.clone(),
        &space.loader.clone(),
    )
    .await?;
    // An update can change filename. Remove the superseded file so both builds
    // cannot load together and destabilize Minecraft.
    for old in &previous {
        if old.file_name != installed.file_name || old.kind != installed.kind {
            let _ = content::remove_content_file(&state.root, &space_id, &old.kind, old.world.as_deref(), &old.file_name);
        }
    }
    space.mods.retain(|m| m.project_id != installed.project_id && !(!m.project_id.contains(':') && m.project_id == project_id));
    space.mods.push(installed);
    let space = space.clone();
    state.persist_spaces(&all)?;
    Ok(space)
}

#[tauri::command]
fn reconcile_content(
    state: State<AppState>,
    space_id: String,
) -> Result<spaces::Space, String> {
    let mut all = state.spaces();
    let space = all.iter_mut().find(|s| s.id == space_id).ok_or("Space not found")?;
    let original_len = space.mods.len();
    space.mods.retain(|m| {
        content::content_file_exists(&state.root, &space_id, &m.kind, m.world.as_deref(), &m.file_name)
    });
    let space = space.clone();
    if space.mods.len() != original_len {
        state.persist_spaces(&all)?;
    }
    Ok(space)
}

#[tauri::command]
fn remove_content(
    state: State<AppState>,
    space_id: String,
    project_id: String,
) -> Result<spaces::Space, String> {
    // Stored ids carry a "source:" prefix; callers may pass either form.
    let bare = project_id.rsplit(':').next().unwrap_or(&project_id);
    let matches = |stored: &str| stored == project_id || stored.rsplit(':').next() == Some(bare);
    let mut all = state.spaces();
    let space = all
        .iter_mut()
        .find(|s| s.id == space_id)
        .ok_or("Space not found")?;
    if let Some(m) = space.mods.iter().find(|m| matches(&m.project_id)) {
        let (file, kind, world) = (m.file_name.clone(), m.kind.clone(), m.world.clone());
        let _ = content::remove_content_file(&state.root, &space_id, &kind, world.as_deref(), &file);
    }
    space.mods.retain(|m| !matches(&m.project_id));
    let space = space.clone();
    state.persist_spaces(&all)?;
    Ok(space)
}

// ---------------------------------------------------------------------------
// remote home page + server list

#[tauri::command]
async fn get_home_pages(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(remote::fetch_home_pages(&state.http, &state.root).await)
}

#[tauri::command]
async fn get_server_list(state: State<'_, AppState>) -> Result<Vec<servers::RemoteServer>, String> {
    Ok(match remote::fetch_updater_file(&state.http, &state.root, "serverlist.json").await {
        Some(raw) => servers::parse_server_list(&raw),
        None => vec![],
    })
}

#[tauri::command]
async fn ping_server(host: String, port: Option<u16>) -> Result<servers::PingResult, String> {
    // DNS with a hard deadline — Windows name resolution can otherwise sit on
    // a dead resolver for many seconds and the row would spin "pinging…".
    const DNS_TIMEOUT_MS: u64 = 2500;
    const PING_TIMEOUT_MS: u64 = 3500;
    let host = host.trim().to_string();
    let port = port.unwrap_or(25565);
    let addr = {
        let mut lookup = tokio::time::timeout(
            std::time::Duration::from_millis(DNS_TIMEOUT_MS),
            tokio::net::lookup_host((host.as_str(), port)),
        )
        .await
        .map_err(|_| format!("Couldn't look up {host} in time"))?
        .map_err(|e| format!("DNS lookup failed: {e}"))?;
        lookup
            .next()
            .ok_or("No address for host")?
    };
    tokio::task::spawn_blocking(move || servers::ping_addr(addr, host.as_str(), port, PING_TIMEOUT_MS))
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Soul Client — our own FPS-tuned Fabric client, served from this repo.

#[tauri::command]
async fn list_soul_clients(state: State<'_, AppState>) -> Result<Vec<soulclient::SoulClientVersion>, String> {
    soulclient::fetch_versions(&state.http, &state.root).await
}

#[tauri::command]
async fn install_soul_client(
    app: AppHandle,
    state: State<'_, AppState>,
    version: String,
) -> Result<spaces::Space, String> {
    soulclient::install(app, state.http.clone(), state.root.clone(), &version).await
}

// ---------------------------------------------------------------------------
// accounts

#[tauri::command]
fn list_accounts(state: State<AppState>) -> Vec<accounts::Account> {
    accounts::load_accounts(&state.root)
}

#[tauri::command]
fn add_offline_account(state: State<AppState>, name: String) -> Result<accounts::Account, String> {
    let acc = accounts::create_offline_account(&state.root, &name)?;
    let mut settings = state.settings.lock().unwrap();
    settings.active_account_id = Some(acc.id.clone());
    let _ = store::save_settings(&state.root, &settings);
    Ok(acc)
}

#[tauri::command]
async fn login_microsoft(state: State<'_, AppState>) -> Result<accounts::Account, String> {
    let acc = accounts::ms_login(&state.http).await?;
    let mut all = accounts::load_accounts(&state.root);
    all.push(acc.clone());
    accounts::save_accounts(&state.root, &all)?;
    let mut settings = state.settings.lock().unwrap();
    settings.active_account_id = Some(acc.id.clone());
    let _ = store::save_settings(&state.root, &settings);
    Ok(acc)
}

#[tauri::command]
fn remove_account(state: State<AppState>, account_id: String) -> Result<(), String> {
    let mut all = accounts::load_accounts(&state.root);
    all.retain(|a| a.id != account_id);
    accounts::save_accounts(&state.root, &all)?;
    accounts::delete_refresh_token(&account_id);
    let mut settings = state.settings.lock().unwrap();
    if settings.active_account_id.as_deref() == Some(&account_id) {
        settings.active_account_id = all.first().map(|a| a.id.clone());
        let _ = store::save_settings(&state.root, &settings);
    }
    Ok(())
}

#[tauri::command]
fn switch_account(state: State<AppState>, account_id: String) -> Result<store::Settings, String> {
    let all = accounts::load_accounts(&state.root);
    if !all.iter().any(|a| a.id == account_id) {
        return Err("Account not found".into());
    }
    let mut settings = state.settings.lock().unwrap();
    settings.active_account_id = Some(account_id);
    store::save_settings(&state.root, &settings)?;
    Ok(settings.clone())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountStatus {
    ok: bool,
    needs_sign_in: bool,
    message: String,
}

#[tauri::command]
async fn validate_account(state: State<'_, AppState>, account_id: String) -> Result<AccountStatus, String> {
    let all = accounts::load_accounts(&state.root);
    let Some(acc) = all.iter().find(|a| a.id == account_id) else {
        return Ok(AccountStatus { ok: false, needs_sign_in: true, message: "Account not found".into() });
    };
    if acc.kind == "offline" {
        return Ok(AccountStatus { ok: true, needs_sign_in: false, message: String::new() });
    }
    match accounts::ms_refresh(&state.http, acc).await {
        Ok(updated) => {
            let mut all = accounts::load_accounts(&state.root);
            if let Some(slot) = all.iter_mut().find(|a| a.id == updated.id) {
                *slot = updated.clone();
                let _ = accounts::save_accounts(&state.root, &all);
            }
            Ok(AccountStatus { ok: true, needs_sign_in: false, message: String::new() })
        }
        Err(e) => Ok(AccountStatus { ok: false, needs_sign_in: true, message: e }),
    }
}

// ---------------------------------------------------------------------------
// profile (skins + capes)

/// Refresh the Microsoft account and return a usable Minecraft token.
async fn fresh_mc_token(state: &State<'_, AppState>, account_id: &str) -> Result<(accounts::Account, String), String> {
    let all = accounts::load_accounts(&state.root);
    let acc = all
        .iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or("Account not found")?;
    if acc.kind != "microsoft" {
        return Err("Skins and capes need a Microsoft account".into());
    }
    let updated = accounts::ms_refresh(&state.http, &acc).await?;
    {
        let mut all = accounts::load_accounts(&state.root);
        if let Some(slot) = all.iter_mut().find(|a| a.id == updated.id) {
            *slot = updated.clone();
            let _ = accounts::save_accounts(&state.root, &all);
        }
    }
    let token = updated
        .access_token
        .clone()
        .ok_or("This account has no Minecraft token—sign in again")?;
    Ok((updated, token))
}

#[tauri::command]
async fn get_account_profile(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<profile::ProfileInfo, String> {
    let (_acc, token) = fresh_mc_token(&state, &account_id).await?;
    profile::profile(&state.http, &token).await
}

#[tauri::command]
async fn set_cape(
    state: State<'_, AppState>,
    account_id: String,
    cape_id: Option<String>,
) -> Result<(), String> {
    let (_acc, token) = fresh_mc_token(&state, &account_id).await?;
    profile::set_cape(&state.http, &token, cape_id.as_deref()).await
}

#[tauri::command]
async fn upload_skin(
    state: State<'_, AppState>,
    account_id: String,
    path: String,
    variant: String,
) -> Result<(), String> {
    let (_acc, token) = fresh_mc_token(&state, &account_id).await?;
    profile::upload_skin(&state.http, &token, std::path::Path::new(&path), &variant).await
}

// ---------------------------------------------------------------------------
// hardware / optimize

#[tauri::command]
async fn hardware_scan() -> hardware::HardwareInfo {
    tokio::task::spawn_blocking(hardware::scan)
        .await
        .unwrap_or_else(|_| hardware::HardwareInfo {
            cpu_name: "Unknown CPU".into(),
            cpu_cores: 4,
            ram_total_gb: 8.0,
            gpu_name: "Unknown GPU".into(),
        })
}

#[tauri::command]
fn recommended_ram(total_gb: f64) -> u32 {
    hardware::recommended_ram(total_gb)
}

// ---------------------------------------------------------------------------
// storage

#[tauri::command]
async fn storage_breakdown(state: State<'_, AppState>) -> Result<Vec<storage::StorageItem>, String> {
    let root = state.root.clone();
    Ok(tokio::task::spawn_blocking(move || storage::breakdown(&root))
        .await
        .unwrap_or_default())
}

#[tauri::command]
async fn clean_storage_junk(state: State<'_, AppState>) -> Result<u64, String> {
    let root = state.root.clone();
    Ok(tokio::task::spawn_blocking(move || storage::clean_junk(&root))
        .await
        .unwrap_or(0))
}

// ---------------------------------------------------------------------------
// modpacks + local content imports

/// Download a modpack archive (Modrinth `.mrpack` or CurseForge manifest zip)
/// into the cache and return its bytes plus the cached path.
///
/// `mc_version` pins the pack to the caller's selected Minecraft version: the
/// newest pack build FOR THAT VERSION is used, and an unsupported selection is
/// a clean error — never a silent "latest" install.
async fn fetch_pack_archive(
    state: &State<'_, AppState>,
    source: &str,
    project_id: &str,
    mc_version: Option<String>,
) -> Result<(Vec<u8>, PathBuf), String> {
    let wanted = mc_version.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let (url, _title, _icon) = match source {
        "curseforge" => {
            let details = content::content_details(&state.http, "curseforge", project_id).await?;
            // Files aren't guaranteed sorted; take a page and pick the newest
            // by numeric id ourselves.
            let mut endpoint = format!("{}/mods/{project_id}/files?pageSize=12", content::CURSEFORGE);
            if let Some(mv) = wanted {
                endpoint.push_str(&format!("&gameVersion={}", urlencode(mv)));
            }
            let resp: serde_json::Value = crate::remote::cf_api_get(&state.http, &endpoint).await?;
            let found = resp
                .get("data")
                .and_then(|x| x.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|f| f.get("id").and_then(|x| x.as_u64()).map(|id| (id, f)))
                .max_by_key(|(id, _)| *id)
                .map(|(_, f)| f);
            let latest = match (found, wanted) {
                (Some(f), _) => f,
                (None, Some(mv)) => {
                    return Err(format!(
                        "This pack has no build for Minecraft {mv}.{}",
                        if details.game_versions.is_empty() { String::new() } else { format!(" It supports: {}", truncate_list(&details.game_versions.join(", "), 8)) }
                    ));
                }
                _ => return Err("Pack has no downloadable file".into()),
            };
            let file_id = latest.get("id").and_then(|x| x.as_u64()).ok_or("Bad file id")?;
            let url = match latest.get("downloadUrl").and_then(|x| x.as_str()) {
                Some(u) if !u.is_empty() => u.to_string(),
                _ => crate::remote::cf_download_url(&state.http, project_id, file_id).await?,
            };
            (url, details.title, details.icon_url)
        }
        _ => {
            let details = content::content_details(&state.http, "modrinth", project_id).await?;
            let mut endpoint = format!("{}/project/{project_id}/version", content::MODRINTH);
            if let Some(mv) = wanted {
                endpoint.push_str(&format!("?game_versions=%5B%22{}%22%5D", urlencode(mv)));
            }
            let versions: Vec<serde_json::Value> = state
                .http
                .get(&endpoint)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;

            // Newest published build wins (list order is not guaranteed).
            let first = versions
                .iter()
                .max_by_key(|v| v.get("date_published").and_then(|x| x.as_str()).unwrap_or("").to_string())
                .cloned();
            let first = match (first, wanted) {
                (Some(v), _) => v,
                (None, Some(mv)) => {
                    // Confirm whether the pack supports that version at all.
                    let all: Vec<serde_json::Value> = match state
                        .http
                        .get(format!("{}/project/{project_id}/version", content::MODRINTH))
                        .send()
                        .await
                    {
                        Ok(r) => r.json::<Vec<serde_json::Value>>().await.unwrap_or_default(),
                        Err(_) => Vec::new(),
                    };
                    let mut supported: Vec<String> = all
                        .iter()
                        .flat_map(|v| v.get("game_versions").and_then(|x| x.as_array()).cloned().unwrap_or_default())
                        .filter_map(|g| g.as_str().map(str::to_string))
                        .collect();
                    supported.sort();
                    supported.dedup();
                    return Err(format!(
                        "This pack has no build for Minecraft {mv}.{}",
                        if supported.is_empty() { String::new() } else { format!(" It supports: {}", truncate_list(&supported.join(", "), 8)) }
                    ));
                }
                _ => return Err("This modpack has no files yet".into()),
            };
            let files = first.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
            let file = files
                .iter()
                .find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
                .or_else(|| files.first())
                .ok_or("This modpack has no downloadable file")?;
            let url = file.get("url").and_then(|x| x.as_str()).ok_or("Bad file URL")?.to_string();
            (url, details.title, details.icon_url)
        }
    };

    let resp = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Couldn't download the modpack ({e})"))?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    let cache_dir = state.root.join("cache").join("packs");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let path = cache_dir.join(format!("{}.pack", uuid::Uuid::new_v4()));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok((bytes, path))
}

fn truncate_list(s: &str, max_items: usize) -> String {
    let items: Vec<&str> = s.split(", ").collect();
    if items.len() <= max_items {
        s.to_string()
    } else {
        format!("{} …and {} more", items[..max_items].join(", "), items.len() - max_items)
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Parse an archive into a plan, auto-detecting the format.
async fn plan_from_archive(bytes: &[u8]) -> Result<(modpack::PackPlan, &'static str), String> {
    match modpack::plan_from_mrpack(bytes) {
        Ok(plan) => Ok((plan, "modrinth")),
        Err(mr_err) => match modpack::plan_from_cf_zip_bytes(bytes).await {
            Ok(plan) => Ok((plan, "curseforge")),
            Err(_) => Err(format!("Not a supported modpack (tried Modrinth .mrpack and CurseForge formats). Modrinth said: {mr_err}")),
        },
    }
}

fn sanitize_pack_name(name: &str) -> String {
    let clean: String = name.chars().filter(|c| !c.is_control()).take(32).collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() { "Modpack".into() } else { trimmed.to_string() }
}

/// One-click: install a Modrinth/CurseForge modpack as a brand-new Space.
/// `mc_version` (optional) pins the pack to the selected Minecraft version.
#[tauri::command]
async fn install_modpack(
    app: AppHandle,
    state: State<'_, AppState>,
    source: String,
    project_id: String,
    mc_version: Option<String>,
) -> Result<spaces::Space, String> {
    let (bytes, temp_path) = fetch_pack_archive(&state, &source, &project_id, mc_version).await?;
    let (plan, detected_source) = plan_from_archive(&bytes).await?;

    let mut space = spaces::Space {
        id: uuid::Uuid::new_v4().to_string(),
        name: sanitize_pack_name(&plan.name),
        icon: "rocket".into(),
        color: "#5ac8fa".into(),
        mc_version: plan.mc_version.clone(),
        loader: plan.loader.clone(),
        loader_version: plan.loader_version.clone(),
        installed_version_id: None,
        mods: vec![],
        created_at: spaces::now_secs(),
        last_played: None,
        ram_gb: None,
        category_id: None,
        shortcut: None,
    };
    if !loaders::LOADER_KINDS.contains(&space.loader.as_str()) {
        space.loader = "vanilla".into();
        space.loader_version = None;
    }

    let mut all = state.spaces();
    all.push(space.clone());
    state.persist_spaces(&all)?;
    drop(all);

    spawn_pack_install(app, state.inner().clone_state(), space.clone(), plan, detected_source.to_string(), temp_path);
    Ok(space)
}

/// Install a locally-picked `.mrpack` or CurseForge manifest `.zip`.
#[tauri::command]
async fn import_modpack_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<spaces::Space, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Can't read the file: {e}"))?;
    if bytes.len() > 1024 * 1024 * 1024 {
        return Err("That file is way too big to be a modpack".into());
    }
    let (plan, detected_source) = plan_from_archive(&bytes).await?;
    let temp_path = state.root.join("cache").join("packs").join(format!("{}.pack", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(temp_path.parent().unwrap());
    std::fs::write(&temp_path, &bytes).map_err(|e| e.to_string())?;

    let mut space = spaces::Space {
        id: uuid::Uuid::new_v4().to_string(),
        name: sanitize_pack_name(&plan.name),
        icon: "rocket".into(),
        color: "#5ac8fa".into(),
        mc_version: plan.mc_version.clone(),
        loader: plan.loader.clone(),
        loader_version: plan.loader_version.clone(),
        installed_version_id: None,
        mods: vec![],
        created_at: spaces::now_secs(),
        last_played: None,
        ram_gb: None,
        category_id: None,
        shortcut: None,
    };
    if !loaders::LOADER_KINDS.contains(&space.loader.as_str()) {
        space.loader = "vanilla".into();
        space.loader_version = None;
    }

    let mut all = state.spaces();
    all.push(space.clone());
    state.persist_spaces(&all)?;

    spawn_pack_install(app, state.inner().clone_state(), space.clone(), plan, detected_source.to_string(), temp_path);
    Ok(space)
}

/// Cloneable subset of AppState for background tasks.
struct BgState {
    root: PathBuf,
}

impl AppState {
    fn clone_state(&self) -> BgState {
        BgState { root: self.root.clone() }
    }
}

/// Background worker: downloads every pack file into the fresh Space while the
/// UI watches live byte progress on the card / bottom bar.
fn spawn_pack_install(
    app: AppHandle,
    bg: BgState,
    space: spaces::Space,
    plan: modpack::PackPlan,
    detected_source: String,
    temp_path: PathBuf,
) {
    tauri::async_runtime::spawn(async move {
        let sid = space.id.clone();
        let label = space.name.clone();
        let label_for_progress = label.clone();
        let total_files = plan.files.len();

        record_log(&app, &bg.root, "info", "modpack", &format!("Installing pack '{label}' ({detected_source}, {total_files} files)"));
        let app2 = app.clone();
        let progress: Arc<dyn Fn(u64, u64) + Send + Sync> = Arc::new(move |done, total| {
            let _ = app2.emit(
                "space-progress",
                ProgressPayload {
                    space_id: sid.clone(),
                    stage: "files".into(),
                    message: format!("Setting up {label_for_progress}"),
                    done,
                    total,
                },
            );
        });

        let http = reqwest::Client::builder()
            .user_agent(concat!("SoulLauncher/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("http client");

        let result = modpack::install_plan_files(&bg.root, http, &space.id, &plan, progress).await;
        let mut plan = plan;
        plan.cleanup();
        let _ = std::fs::remove_file(&temp_path);

        match result {
            Ok(()) => {
                let records = modpack::records_for_plan(&plan);
                let count = records.len();
                let mut all = spaces::load_spaces(&bg.root);
                if let Some(slot) = all.iter_mut().find(|s| s.id == space.id) {
                    slot.mods.extend(records);
                    let _ = spaces::save_spaces(&bg.root, &all);
                }
                record_log(&app, &bg.root, "info", "modpack", &format!("Pack '{label}' ready ({count} items)"));
                let _ = app.emit(
                    "space-progress",
                    ProgressPayload {
                        space_id: space.id.clone(),
                        stage: "ready".into(),
                        message: format!("{label} is ready — press Play"),
                        done: 0,
                        total: 0,
                    },
                );
            }
            Err(e) => {
                record_log(&app, &bg.root, "error", "modpack", &format!("Pack '{label}' failed: {e}"));
                let _ = app.emit(
                    "space-progress",
                    ProgressPayload {
                        space_id: space.id,
                        stage: "error".into(),
                        message: e,
                        done: 0,
                        total: 0,
                    },
                );
            }
        }
    });
}

/// Worlds (saves) available in a Space — used as datapack install targets.
#[tauri::command]
fn list_space_worlds(state: State<AppState>, space_id: String) -> Vec<String> {
    let saves = spaces::space_dir(&state.root, &space_id).join("saves");
    let mut out: Vec<String> = std::fs::read_dir(&saves)
        .map(|rd| rd.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_string()).collect())
        .unwrap_or_default();
    out.sort();
    out
}

/// Copy uploaded local files (.jar/.zip) into a Space, sniffing what each one
/// is unless told otherwise. Datapacks accept a target world.
#[tauri::command]
fn import_content_files(
    state: State<AppState>,
    space_id: String,
    paths: Vec<String>,
    kind: Option<String>,
    world: Option<String>,
) -> Result<spaces::Space, String> {
    let mut all = state.spaces();
    let space = all.iter_mut().find(|s| s.id == space_id).ok_or("Space not found")?;

    for raw in &paths {
        let src = PathBuf::from(raw);
        let file_name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or("Bad file path")?;
        if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
            return Err("Bad file name".into());
        }
        let resolved_kind = kind.clone().unwrap_or_else(|| modpack::sniff_kind(&src).to_string());
        if !["mod", "resourcepack", "shader", "datapack"].contains(&resolved_kind.as_str()) {
            return Err("Unsupported file type".into());
        }

        let dir = content::content_dir(&state.root, &space_id, &resolved_kind, world.as_deref());
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::copy(&src, dir.join(&file_name)).map_err(|e| format!("Couldn't copy {file_name}: {e}"))?;

        let title = file_name.trim_end_matches(".jar").trim_end_matches(".zip").to_string();
        let record = spaces::SpaceMod {
            project_id: format!("local:{file_name}"),
            title,
            icon_url: String::new(),
            version_number: String::new(),
            file_name: file_name.clone(),
            kind: resolved_kind,
            world: world.clone(),
        };
        space.mods.retain(|m| !(m.project_id == record.project_id && m.world == record.world));
        space.mods.push(record);
    }

    let space = space.clone();
    state.persist_spaces(&all)?;
    Ok(space)
}

/// Move a library datapack into a world (`Some(world)`), or back to the
/// library (`None`). The library copy always stays for re-use.
#[tauri::command]
fn assign_datapack(
    state: State<AppState>,
    space_id: String,
    project_id: String,
    world: Option<String>,
) -> Result<spaces::Space, String> {
    let bare = project_id.rsplit(':').next().unwrap_or(&project_id);
    let mut all = state.spaces();
    let space = all.iter_mut().find(|s| s.id == space_id).ok_or("Space not found")?;

    let record = space
        .mods
        .iter_mut()
        .find(|m| m.kind == "datapack" && (m.project_id == project_id || m.project_id.rsplit(':').next() == Some(bare)))
        .ok_or("Datapack not found in this Space")?;

    let file_name = record.file_name.clone();
    let from = content::content_dir(&state.root, &space_id, "datapack", None).join(&file_name);
    if !from.exists() {
        return Err("The datapack file is gone from the library".into());
    }
    let to_dir = content::content_dir(&state.root, &space_id, "datapack", world.as_deref());
    std::fs::create_dir_all(&to_dir).map_err(|e| e.to_string())?;
    std::fs::copy(&from, to_dir.join(&file_name)).map_err(|e| e.to_string())?;

    record.world = world.filter(|w| !w.trim().is_empty());
    let space = space.clone();
    state.persist_spaces(&all)?;
    Ok(space)
}

// ---------------------------------------------------------------------------
// updates

#[tauri::command]
async fn check_update(state: State<'_, AppState>) -> Result<update::UpdateInfo, String> {
    update::check(&state.http, env!("CARGO_PKG_VERSION")).await
}

#[tauri::command]
async fn download_update(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let app2 = app.clone();
    let path = update::download_installer(&state.http, &state.root, &url, move |done, total| {
        let _ = app2.emit(
            "update-progress",
            serde_json::json!({ "done": done, "total": total }),
        );
    })
    .await?;
    update::run_installer(&path)?;
    app.exit(0);
    Ok(())
}

// ---------------------------------------------------------------------------
// misc net helpers

#[tauri::command]
async fn fetch_bytes_b64(state: State<'_, AppState>, url: String) -> Result<String, String> {
    remote::fetch_bytes_b64(&state.http, &url).await
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogPayload {
    timestamp: u64,
    level: String,
    source: String,
    message: String,
}

fn record_log(app: &AppHandle, root: &PathBuf, level: &str, source: &str, message: &str) {
    let clean = message.replace('\r', "").trim().to_string();
    if clean.is_empty() {
        return;
    }
    let payload = LogPayload {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or_default(),
        level: level.to_string(),
        source: source.to_string(),
        message: clean,
    };
    if let Ok(line) = serde_json::to_string(&payload) {
        let path = root.join("logs").join("soul.log");
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{line}");
        }
    }
    let _ = app.emit("app-log", payload);
}

#[tauri::command]
fn read_logs(state: State<AppState>) -> Result<String, String> {
    let path = state.root.join("logs").join("soul.log");
    let raw = std::fs::read(&path).unwrap_or_default();
    let start = raw.len().saturating_sub(512 * 1024);
    Ok(String::from_utf8_lossy(&raw[start..]).to_string())
}

// ---------------------------------------------------------------------------
// launching

#[tauri::command]
async fn launch_space(
    app: AppHandle,
    state: State<'_, AppState>,
    space_id: String,
    server_ip: Option<String>,
    server_port: Option<u16>,
) -> Result<(), String> {
    {
        let running = state.running.lock().unwrap();
        if running.get(&space_id).copied().unwrap_or(false) {
            return Err("This Space is already running".into());
        }
    }

    // account first
    let settings = state.settings.lock().unwrap().clone();
    let accounts_list = accounts::load_accounts(&state.root);
    let account = settings
        .active_account_id
        .as_deref()
        .and_then(|id| accounts_list.iter().find(|a| a.id == id))
        .cloned()
        .or_else(|| accounts_list.first().cloned())
        .ok_or("Add an account first—it takes 10 seconds!")?;

    let account = if account.kind == "microsoft" {
        accounts::ms_refresh(&state.http, &account)
            .await
            .map_err(|e| format!("Microsoft sign-in problem: {e}"))?
    } else {
        account
    };

    let all_spaces = state.spaces();
    let idx = all_spaces
        .iter()
        .position(|s| s.id == space_id)
        .ok_or("Space not found")?;
    let mut space = all_spaces[idx].clone();

    let server = server_ip
        .filter(|ip| !ip.trim().is_empty())
        .map(|ip| (ip, server_port.unwrap_or(25565)));

    let root = state.root.clone();
    let http = state.http.clone();
    let app2 = app.clone();
    let sid = space_id.clone();
    let running = state.running.clone();
    let log_root = root.clone();

    {
        running.lock().unwrap().insert(space_id.clone(), true);
    }

    tauri::async_runtime::spawn(async move {
        // Safety net: no matter how this task ends (error, panic...), the Space
        // must be unlocked and the UI must receive a terminal progress event.
        let mut guard = LaunchGuard {
            running: running.clone(),
            sid: sid.clone(),
            app: app2.clone(),
            root: log_root.clone(),
            armed: true,
        };
        let sid2 = sid.clone();
        let app3 = app2.clone();
        let log_root2 = log_root.clone();
        let emit = Arc::new(move |stage: &str, message: &str, done: u64, total: u64| {
            record_log(&app3, &log_root2, if stage == "error" { "error" } else { "info" }, stage, message);
            let _ = app3.emit(
                "space-progress",
                ProgressPayload {
                    space_id: sid2.clone(),
                    stage: stage.to_string(),
                    message: message.to_string(),
                    done,
                    total,
                },
            );
        });
        let sink = ProgressSink::new(emit);
        let running2 = running.clone();
        let sid_exit = sid.clone();
        let app_exit = app2.clone();
        let log_root_exit = log_root.clone();
        let on_exit: Arc<launch::ExitFn> = Arc::new(move |code| {
            running2.lock().unwrap().insert(sid_exit.clone(), false);
            let message = format!("Minecraft process closed with exit code: {code:?}");
            record_log(&app_exit, &log_root_exit, "info", "minecraft", &message);
            let _ = app_exit.emit(
                "space-progress",
                ProgressPayload {
                    space_id: sid_exit.clone(),
                    stage: "stopped".into(),
                    message,
                    done: 0,
                    total: 0,
                },
            );
        });
        // Category settings sync: after the game closes, the Space's options
        // and server list become the truth for its whole category.
        let sync_root = root.clone();
        let sync_space = space.clone();
        let sync_app = app2.clone();
        let sync_log_root = log_root.clone();
        let on_exit: Arc<launch::ExitFn> = {
            let prev = on_exit;
            Arc::new(move |code| {
                prev(code);
                if code.is_some() {
                    if let Err(e) = categories::pull_space_into_shared(&sync_root, &sync_space) {
                        record_log(&sync_app, &sync_log_root, "error", "category", &format!("Couldn't sync category settings back: {e}"));
                    }
                }
            })
        };
        let result = launch::prepare_and_launch(
            http,
            root.clone(),
            &mut space,
            &settings,
            &account,
            sink,
            on_exit,
            true,
            server,
        )
        .await;

        match result {
            Ok(outcome) => {
                guard.armed = false; // normal path: on_exit reports "stopped" later
                space.last_played = Some(spaces::now_secs());
                space.installed_version_id = Some(outcome.version_id.clone());
                let mut all = spaces::load_spaces(&root);
                if let Some(pos) = all.iter().position(|s| s.id == space.id) {
                    all[pos] = space.clone();
                    let _ = spaces::save_spaces(&root, &all);
                }
                let _ = app2.emit(
                    "space-progress",
                    ProgressPayload {
                        space_id: sid.clone(),
                        stage: "running".into(),
                        message: "Playing".into(),
                        done: 0,
                        total: 0,
                    },
                );
            }
            Err(e) => {
                running.lock().unwrap().insert(sid.clone(), false);
                guard.armed = false;
                record_log(&app2, &log_root, "error", "launch", &e);
                let _ = app2.emit(
                    "space-progress",
                    ProgressPayload {
                        space_id: sid.clone(),
                        stage: "error".into(),
                        message: e,
                        done: 0,
                        total: 0,
                    },
                );
            }
        }
        drop(guard);
    });

    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    space_id: String,
    stage: String,
    message: String,
    done: u64,
    total: u64,
}

/// If the launch task dies unexpectedly (e.g. a panic), unlock the Space and
/// tell the UI instead of leaving it stuck on "Loading" forever.
struct LaunchGuard {
    running: Arc<Mutex<HashMap<String, bool>>>,
    sid: String,
    app: AppHandle,
    root: PathBuf,
    armed: bool,
}

impl Drop for LaunchGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        {
            let mut map = self.running.lock().unwrap_or_else(|e| e.into_inner());
            map.insert(self.sid.clone(), false);
        }
        let _ = self.app.emit(
            "space-progress",
            ProgressPayload {
                space_id: self.sid.clone(),
                stage: "error".into(),
                message: "Something crashed inside the launcher—please try again".into(),
                done: 0,
                total: 0,
            },
        );
        record_log(&self.app, &self.root, "error", "launcher", "Something crashed inside the launcher—please try again");
    }
}

#[tauri::command]
fn is_running(state: State<AppState>, space_id: String) -> bool {
    state
        .running
        .lock()
        .unwrap()
        .get(&space_id)
        .copied()
        .unwrap_or(false)
}

#[tauri::command]
fn app_data_dir(state: State<AppState>) -> String {
    state.root.to_string_lossy().to_string()
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        open::that(&url).map_err(|e| e.to_string())
    } else {
        Err("Bad link".into())
    }
}

// ---------------------------------------------------------------------------

fn main() {
    let root = store::data_root();
    let _ = store::ensure_dirs(&root);
    let settings = store::load_settings(&root);

    // Hidden self-test: `soul-launcher --selftest <mcVersion> [loader] [--run]`
    let argv: Vec<String> = std::env::args().collect();
    if let Some(pos) = argv.iter().position(|a| a == "--selftest") {
        let mc = argv.get(pos + 1).cloned().unwrap_or_else(|| "1.21.1".into());
        let loader = argv.get(pos + 2).cloned().unwrap_or_else(|| "vanilla".into());
        let run = argv.iter().any(|a| a == "--run");
        let code = selftest(root.clone(), settings.clone(), mc, loader, run);
        std::process::exit(code);
    }

    let http = reqwest::Client::builder()
        .user_agent(concat!("SoulLauncher/", env!("CARGO_PKG_VERSION")))
        .pool_max_idle_per_host(64)
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("http client");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            root: root.clone(),
            http,
            settings: Mutex::new(settings),
            running: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            list_game_versions,
            pin_space_shortcut,
            unpin_space_shortcut,
            launch_args,
            list_loader_versions,
            list_installed_versions,
            list_spaces,
            create_space,
            update_space,
            list_categories,
            create_category,
            rename_category,
            delete_category,
            set_space_category,
            get_category_servers,
            set_category_servers,
            get_category_options,
            set_category_options,
            space_link_status,
            relink_category,
            duplicate_space,
            delete_space,
            open_space_folder,
            export_space,
            import_space,
            list_soul_clients,
            install_soul_client,
            search_content,
            content_details,
            install_content,
            reconcile_content,
            remove_content,
            install_modpack,
            import_modpack_file,
            import_content_files,
            list_space_worlds,
            assign_datapack,
            get_home_pages,
            get_server_list,
            ping_server,
            list_accounts,
            add_offline_account,
            login_microsoft,
            remove_account,
            switch_account,
            validate_account,
            get_account_profile,
            set_cape,
            upload_skin,
            hardware_scan,
            recommended_ram,
            storage_breakdown,
            clean_storage_junk,
            check_update,
            download_update,
            fetch_bytes_b64,
            launch_space,
            is_running,
            app_data_dir,
            open_url,
            read_logs,
        ])
        .setup(move |app| {
            #[cfg(desktop)]
            {
                let _window = app.get_webview_window("main");
            }
            record_log(app.handle(), &root, "info", "system", "Soul Launcher started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Soul Launcher");
}

// ---------------------------------------------------------------------------
// Self test: drives the REAL launch pipeline from the command line.

fn selftest(root: PathBuf, settings: store::Settings, mc: String, loader: String, run: bool) -> i32 {
    println!("=== Soul Launcher self-test ===");
    println!("root: {}", root.display());
    println!("version: {mc} | loader: {loader} | run: {run}");

    let http = reqwest::Client::builder()
        .user_agent(concat!("SoulLauncher/", env!("CARGO_PKG_VERSION")))
        .pool_max_idle_per_host(64)
        .build()
        .expect("http client");

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let account = accounts::Account {
            id: "selftest".into(),
            username: "SelfTester".into(),
            uuid: accounts::offline_uuid("SelfTester"),
            kind: "offline".into(),
            access_token: None,
            xuid: None,
        };
        let mut space = spaces::Space {
            id: "selftest-space".into(),
            name: "SelfTest".into(),
            icon: "rocket".into(),
            color: "#5ac8fa".into(),
            mc_version: mc,
            loader,
            loader_version: None,
            installed_version_id: None,
            mods: vec![],
            created_at: spaces::now_secs(),
            last_played: None,
            ram_gb: Some(2),
            category_id: None,
            shortcut: None,
        };

        let emit = Arc::new(|stage: &str, message: &str, done: u64, total: u64| {
            if total > 0 {
                let pct = (done * 100) / total.max(1);
                print!("\r[{stage}] {message} {pct}% ({done}/{total})          ");
                use std::io::Write;
                let _ = std::io::stdout().flush();
            } else {
                print!("\r[{stage}] {message}                    ");
                use std::io::Write;
                let _ = std::io::stdout().flush();
            }
        });
        let sink = ProgressSink::new(emit);
        let on_exit: Arc<launch::ExitFn> = Arc::new(|code| {
            println!("\n[exit] game process closed with code: {code:?}");
        });

        match launch::prepare_and_launch(
            http,
            root,
            &mut space,
            &settings,
            &account,
            sink,
            on_exit,
            run,
            None,
        )
        .await
        {
            Ok(outcome) => {
                println!("\n[ok] resolved version: {}", outcome.version_id);
                0
            }
            Err(e) => {
                eprintln!("\n[FAIL] {e}");
                1
            }
        }
    })
}
