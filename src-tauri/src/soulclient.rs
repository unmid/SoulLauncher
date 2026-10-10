//! Soul Client — the launcher's own tuned FPS client.
//!
//! A Soul Client release is a zip in this very repo, e.g.
//!   client/version-26.2/soul-client-26-2.zip
//! Inside the zip sits `soul-client.json`, a strict manifest describing which
//! Minecraft version it targets, which Fabric loader it needs and which
//! public mods (Modrinth project ids) make up the client.
//!
//! Two release styles are supported:
//! - Manifest-only: the tiny zip only describes the build, and the launcher
//!   installs the listed public mods from Modrinth into the Space.
//! - Fully bundled: the zip also carries `mods/`, `config/`,
//!   `resourcepacks/` and `shaderpacks/` trees plus `"bundleIncluded": true`.
//!   The launcher extracts those files directly instead of re-downloading.

use crate::content;
use crate::spaces::{self, Space, SpaceMod};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

const MANIFEST_NAME: &str = "soul-client.json";
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const ALLOWED_BUNDLE_DIRS: [&str; 5] = ["mods/", "config/", "resourcepacks/", "shaderpacks/", "datapacks/"];
const ALLOWED_ROOT_FILES: [&str; 2] = ["options.txt", "servers.dat"];

// ---------------------------------------------------------------------------
// versions index (client/versions.json in the repo)

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoulClientVersion {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub mc_version: String,
    #[serde(default)]
    pub loader_version: String,
    #[serde(default)]
    pub zip: String,
    #[serde(default)]
    pub mod_count: u32,
    #[serde(default)]
    pub released: String,
    #[serde(default)]
    pub notes: String,
}

/// Client builds compiled into the binary, so the Soul Client card works
/// offline and keeps working before a new list is pushed to the live repo.
const BUNDLED_VERSIONS: &str = include_str!("../../client/versions.json");

/// Strict per-entry parse: one bad entry must never kill the whole list.
fn parse_versions(raw: &str) -> Vec<SoulClientVersion> {
    let Ok(v) = serde_json::from_str::<Value>(raw) else { return Vec::new() };
    let Some(arr) = v.get("versions").and_then(|x| x.as_array()) else { return Vec::new() };
    let mut out = Vec::new();
    for item in arr.iter().take(32) {
        if let Ok(entry) = serde_json::from_value::<SoulClientVersion>(item.clone()) {
            if valid_id(&entry.id)
                && valid_id(&entry.mc_version)
                && entry.zip.starts_with("client/version-")
                && !entry.zip.contains("..")
            {
                out.push(entry);
            }
        }
    }
    out
}

fn merge_versions(list: &mut Vec<SoulClientVersion>, extra: Vec<SoulClientVersion>) {
    for entry in extra {
        if let Some(slot) = list.iter_mut().find(|x| x.id == entry.id) {
            *slot = entry; // newer source wins for the same id
        } else {
            list.push(entry);
        }
    }
}

pub async fn fetch_versions(http: &reqwest::Client, root: &PathBuf) -> Result<Vec<SoulClientVersion>, String> {
    // 1. built-in list, 2. a local `client/versions.json` dropped into the
    // data folder (offline / self-hosted builds), 3. the live repo list.
    let mut list = parse_versions(BUNDLED_VERSIONS);
    if let Ok(raw) = std::fs::read_to_string(root.join("client").join("versions.json")) {
        merge_versions(&mut list, parse_versions(&raw));
    }
    if let Some(raw) = crate::remote::fetch_updater_file(http, root, "client/versions.json").await {
        merge_versions(&mut list, parse_versions(&raw));
    }
    if list.is_empty() {
        return Err("Couldn't reach the Soul Client list — check your connection and try again".into());
    }
    Ok(list)
}

fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 24
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

// ---------------------------------------------------------------------------
// manifest inside the zip

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SoulManifest {
    name: String,
    version: String,
    mc_version: String,
    #[serde(default = "default_loader")]
    loader: String,
    /// exact Fabric loader version, or "latest"
    #[serde(default)]
    loader_version: String,
    /// one-line pitch shown in progress messages
    #[serde(default)]
    description: String,
    #[serde(default)]
    ram_gb: Option<u32>,
    /// true when the same zip already contains the mod files
    #[serde(default)]
    bundle_included: bool,
    mods: Vec<SoulMod>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SoulMod {
    /// modrinth (only public source for now)
    #[serde(default = "default_source")]
    source: String,
    project_id: String,
    #[serde(default)]
    title: String,
}

fn default_loader() -> String {
    "fabric".into()
}
fn default_source() -> String {
    "modrinth".into()
}

impl SoulManifest {
    fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("Manifest is missing the client name".into());
        }
        if !valid_id(&self.version) {
            return Err("Bad client version in manifest".into());
        }
        if !valid_id(&self.mc_version) {
            return Err("Bad Minecraft version in manifest".into());
        }
        if self.loader != "fabric" {
            return Err("Soul Client builds on Fabric only".into());
        }
        if self.mods.is_empty() || self.mods.len() > 80 {
            return Err("Manifest mod list looks wrong".into());
        }
        for m in &self.mods {
            if m.source != "modrinth" {
                return Err("Manifest may only reference public Modrinth mods".into());
            }
            if !valid_id(&m.project_id) {
                return Err("A mod id in the manifest looks wrong".into());
            }
        }
        Ok(())
    }
}

struct BundleResult {
    manifest: SoulManifest,
    included: Vec<SpaceMod>,
}

/// Read the manifest and extract any bundled client files. Blocking zip work
/// runs on a blocking thread; callers pass only owned values.
fn parse_and_extract(archive_path: PathBuf, root: PathBuf, space_id: String) -> Result<BundleResult, String> {
    let file = std::fs::File::open(&archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(std::io::BufReader::new(file))
        .map_err(|e| format!("The client zip is damaged: {e}"))?;
    let raw = {
        let mut entry = archive
            .by_name(MANIFEST_NAME)
            .map_err(|_| format!("The zip has no {MANIFEST_NAME} — it is not a Soul Client build"))?;
        if entry.size() > MAX_MANIFEST_BYTES {
            return Err("Manifest is implausibly large".into());
        }
        let mut buf = Vec::with_capacity(entry.size() as usize);
        std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| e.to_string())?;
        buf
    };
    let manifest: SoulManifest =
        serde_json::from_slice(&raw).map_err(|_| "soul-client.json is not valid JSON".to_string())?;
    manifest.validate()?;

    let mut included = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(rel) = crate::modpack::safe_rel_path(entry.name()) else { continue };
        if rel == MANIFEST_NAME {
            continue;
        }
        let allowed = ALLOWED_BUNDLE_DIRS.iter().any(|dir| rel.starts_with(dir))
            || ALLOWED_ROOT_FILES.iter().any(|name| rel == *name);
        if !allowed {
            continue;
        }
        if entry.size() > 512 * 1024 * 1024 {
            return Err(format!("{rel} is implausibly large"));
        }
        let dest = spaces::space_dir(&root, &space_id).join(&rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;

        // Only jars shipped with an explicitly bundled build become records.
        // Config/resource/shader files land on disk without pretending to be
        // tracked content entries.
        if manifest.bundle_included && rel.starts_with("mods/") && rel.to_lowercase().ends_with(".jar") {
            let file_name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
            included.push(SpaceMod {
                project_id: format!("soul:{}:{file_name}", manifest.version),
                title: display_name_for_file(&file_name, &manifest.mods),
                icon_url: String::new(),
                version_number: "included".into(),
                file_name,
                kind: "mod".into(),
                world: None,
            });
        }
    }
    Ok(BundleResult { manifest, included })
}

fn normalize_name(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn display_name_for_file(file_name: &str, mods: &[SoulMod]) -> String {
    let stem = file_name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(file_name);
    let normalized = normalize_name(stem);
    let mut best: Option<&SoulMod> = None;
    let mut best_len = 0;
    for m in mods {
        for candidate in [if m.title.is_empty() { None } else { Some(m.title.as_str()) }, Some(m.project_id.as_str())]
            .into_iter()
            .flatten()
        {
            let key = normalize_name(candidate);
            if key.is_empty() {
                continue;
            }
            if normalized == key || normalized.starts_with(&key) {
                if key.len() > best_len {
                    best_len = key.len();
                    best = Some(m);
                }
            }
        }
    }
    best.map(|m| {
        if m.title.is_empty() {
            m.project_id.clone()
        } else {
            m.title.clone()
        }
    })
    .unwrap_or_else(|| stem.replace(['-', '_'], " "))
}

// ---------------------------------------------------------------------------
// install

async fn resolve_loader_version(
    http: &reqwest::Client,
    manifest: &SoulManifest,
    entry: &SoulClientVersion,
) -> Result<String, String> {
    for candidate in [&manifest.loader_version, &entry.loader_version] {
        let candidate = candidate.trim();
        if !candidate.is_empty() && candidate != "latest" {
            return Ok(candidate.to_string());
        }
    }
    let mc = if manifest.mc_version.is_empty() {
        entry.mc_version.as_str()
    } else {
        manifest.mc_version.as_str()
    };
    let list = crate::loaders::fabric_loader_versions(http, mc).await?;
    list.first().cloned().ok_or_else(|| format!("No Fabric loader exists for Minecraft {mc} yet"))
}

async fn download_archive(
    http: &reqwest::Client,
    url: &str,
    dest: &PathBuf,
    emit: std::sync::Arc<dyn Fn(&str, String, u64, u64) + Send + Sync>,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let resp = http
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Couldn't download the client pack: {e}"))?
        .error_for_status()
        .map_err(|_| "This Soul Client build isn't published yet — try again once it is uploaded".to_string())?;
    let total = resp.content_length().unwrap_or(0);
    if total > MAX_ARCHIVE_BYTES {
        return Err("Client zip is implausibly large".into());
    }
    let tmp = dest.with_extension("part");
    let mut out = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut seen: u64 = 0;
    emit("files", "Downloading the Soul Client pack…".into(), 0, total);
    let stream_result: Result<(), String> = async {
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            seen = seen.saturating_add(chunk.len() as u64);
            if seen > MAX_ARCHIVE_BYTES {
                return Err("Client zip is implausibly large".into());
            }
            out.write_all(&chunk).await.map_err(|e| e.to_string())?;
            emit("files", "Downloading the Soul Client pack…".into(), seen, total.max(seen));
        }
        out.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    drop(out);
    if let Err(e) = stream_result {
        // Never leave a half-written .part behind after a failure.
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e);
    }
    tokio::fs::rename(&tmp, dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Create the Space for a Soul Client install, then fill it in the
/// background. The card appears immediately; progress flows through the
/// usual `space-progress` events, exactly like modpack installs.
pub async fn install(
    app: tauri::AppHandle,
    http: reqwest::Client,
    root: PathBuf,
    version: &str,
) -> Result<Space, String> {
    use tauri::Emitter;
    let versions = fetch_versions(&http, &root).await?;
    let entry = versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| "Unknown Soul Client version".to_string())?
        .clone();
    if entry.mc_version.is_empty() {
        return Err("This Soul Client entry is missing its Minecraft version".into());
    }

    let zip_url = format!("{}/{}", crate::remote::RAW_BASE, entry.zip.trim_matches('/'));
    // A local build in <data>/client/<zip path> is used as-is (offline /
    // self-hosted); otherwise fail before creating anything when the build
    // was never uploaded to the repo.
    let local_zip = {
        // Accept both <data>/client/version-x/... (a copied client folder)
        // and <data>/client/version-x/... with the full zip path preserved.
        let rel = entry.zip.trim_start_matches('/').trim_start_matches("client/");
        [root.join("client").join(rel), root.join(entry.zip.trim_matches('/'))]
            .into_iter()
            .find(|p| p.is_file())
    };
    if local_zip.is_none() {
        http.head(&zip_url)
            .send()
            .await
            .map_err(|e| format!("Couldn't reach the Soul Client build: {e}"))?
            .error_for_status()
            .map_err(|_| "This Soul Client build isn't published yet — try again once it is uploaded".to_string())?;
    }

    // The index carries enough truth to create the Space right away.
    let manifest_stub = SoulManifest {
        name: entry.name.clone(),
        version: entry.id.clone(),
        mc_version: entry.mc_version.clone(),
        loader: "fabric".into(),
        loader_version: entry.loader_version.clone(),
        description: entry.notes.clone(),
        ram_gb: if entry.mod_count > 0 { Some(4) } else { None },
        bundle_included: false,
        mods: Vec::new(),
    };
    let loader_version = resolve_loader_version(&http, &manifest_stub, &entry).await?;
    let space = Space {
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("{} {}", entry.name, entry.id),
        icon: "soul".into(),
        color: "#f26a3c".into(),
        mc_version: entry.mc_version.clone(),
        loader: "fabric".into(),
        loader_version: Some(loader_version),
        installed_version_id: None,
        mods: vec![],
        created_at: spaces::now_secs(),
        last_played: None,
        ram_gb: Some(4),
        category_id: None,
        shortcut: None,
    };
    let _ = std::fs::create_dir_all(spaces::space_dir(&root, &space.id));
    let mut all = spaces::load_spaces(&root);
    all.push(space.clone());
    spaces::save_spaces(&root, &all)?;

    let sid = space.id.clone();
    let emit_start = {
        let app = app.clone();
        let sid = sid.clone();
        move |stage: &str, message: String, done: u64, total: u64| {
            let _ = app.emit(
                "space-progress",
                serde_json::json!({
                    "spaceId": sid,
                    "stage": stage,
                    "message": message,
                    "done": done,
                    "total": total,
                }),
            );
        }
    };
    emit_start("loader", format!("Setting up {}…", space.name), 0, 0);
    let archive_path = root.join("cache").join("soul").join(format!("soul-client-{}.zip", entry.id));
    let download_emit: std::sync::Arc<dyn Fn(&str, String, u64, u64) + Send + Sync> =
        std::sync::Arc::new({
            let app = app.clone();
            let sid = space.id.clone();
            move |stage: &str, message: String, done: u64, total: u64| {
                let _ = app.emit(
                    "space-progress",
                    serde_json::json!({
                        "spaceId": sid,
                        "stage": stage,
                        "message": message,
                        "done": done,
                        "total": total,
                    }),
                );
            }
        });
    tauri::async_runtime::spawn(client_install_worker(app, http, root, space.clone(), entry, zip_url, archive_path, download_emit, local_zip));
    Ok(space)
}

async fn client_install_worker(
    app: tauri::AppHandle,
    http: reqwest::Client,
    root: PathBuf,
    space: Space,
    entry: SoulClientVersion,
    zip_url: String,
    archive_path: PathBuf,
    download_emit: std::sync::Arc<dyn Fn(&str, String, u64, u64) + Send + Sync>,
    local_zip: Option<PathBuf>,
) {
    use tauri::Emitter;
    let sid = space.id.clone();
    let label = space.name.clone();
    let emit = |stage: &str, message: String, done: u64, total: u64| {
        let _ = app.emit(
            "space-progress",
            serde_json::json!({
                "spaceId": sid,
                "stage": stage,
                "message": message,
                "done": done,
                "total": total,
            }),
        );
    };

    if let Some(local) = &local_zip {
        emit("files", "Using the local Soul Client build…".into(), 0, 0);
        if let Some(parent) = archive_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::copy(local, &archive_path).map(|_| ()) {
            let message = format!("Couldn't use the local client build: {e}");
            emit("error", message.clone(), 0, 0);
            crate::record_log(&app, &root, "error", "soulclient", &message);
            return;
        }
    } else if let Err(e) = download_archive(&http, &zip_url, &archive_path, download_emit).await {
        emit("error", e.clone(), 0, 0);
        crate::record_log(&app, &root, "error", "soulclient", &e);
        return;
    }

    let bundle = tokio::task::spawn_blocking({
        let archive_path = archive_path.clone();
        let root = root.clone();
        let sid = sid.clone();
        move || parse_and_extract(archive_path, root, sid)
    })
    .await
    .map_err(|e| e.to_string());
    let bundle = match bundle {
        Ok(Ok(bundle)) => bundle,
        Ok(Err(e)) => {
            emit("error", e.clone(), 0, 0);
            crate::record_log(&app, &root, "error", "soulclient", &e);
            return;
        }
        Err(e) => {
            emit("error", format!("The client install crashed: {e}"), 0, 0);
            return;
        }
    };
    if bundle.manifest.mc_version != entry.mc_version {
        crate::record_log(
            &app,
            &root,
            "warn",
            "soulclient",
            &format!("Manifest targets {}, index said {}", bundle.manifest.mc_version, entry.mc_version),
        );
    }

    let total = bundle.manifest.mods.len() as u64;
    crate::record_log(&app, &root, "info", "soulclient", &format!("Installing {label}: {total} mods"));

    let mut installed: Vec<SpaceMod> = bundle.included;
    let mut failed: Vec<String> = Vec::new();
    if !bundle.manifest.bundle_included {
        for (i, m) in bundle.manifest.mods.iter().enumerate() {
            emit(
                "files",
                format!("Adding {} ({}/{})", if m.title.is_empty() { &m.project_id } else { &m.title }, i + 1, total),
                i as u64,
                total,
            );
            match content::install_content(
                &http,
                &root,
                &sid,
                "modrinth",
                "mod",
                &m.project_id,
                &space.mc_version,
                "fabric",
            )
            .await
            {
                Ok(record) => installed.push(record),
                Err(e) => {
                    let title = if m.title.is_empty() { m.project_id.clone() } else { m.title.clone() };
                    crate::record_log(&app, &root, "warn", "soulclient", &format!("{title}: {e}"));
                    failed.push(title);
                }
            }
        }
    }

    let installed_count = {
        let installed_count = installed.len();
        let mut all = spaces::load_spaces(&root);
        if let Some(slot) = all.iter_mut().find(|s| s.id == sid) {
            slot.mods.append(&mut installed);
            if slot.ram_gb.is_none() {
                slot.ram_gb = bundle.manifest.ram_gb;
            }
            let _ = spaces::save_spaces(&root, &all);
        }
        installed_count
    };

    if failed.is_empty() {
        emit("ready", format!("{label} is ready — press Play{}", if bundle.manifest.description.is_empty() { String::new() } else { format!(" · {}", bundle.manifest.description) }), 0, 0);
        crate::record_log(&app, &root, "info", "soulclient", &format!("{label} ready ({installed_count} mods)"));
    } else if installed_count == 0 {
        emit("error", format!("{label} couldn't install its mods — check your connection"), 0, 0);
    } else {
        let missing = failed.join(", ");
        emit(
            "ready",
            format!("{label} is ready — a few mods could not be installed: {missing}"),
            0,
            0,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_mod(project_id: &str, title: &str) -> SoulMod {
        SoulMod {
            source: "modrinth".into(),
            project_id: project_id.into(),
            title: title.into(),
        }
    }

    #[test]
    fn bundled_versions_parse_and_merge() {
        let bundled = parse_versions(BUNDLED_VERSIONS);
        assert!(bundled.len() >= 4, "expected the shipped client builds, got {}", bundled.len());
        assert!(bundled.iter().any(|v| v.mc_version == "1.21.1"));
        assert!(bundled.iter().all(|v| v.zip.starts_with("client/version-")));

        // malformed input never kills the list
        assert!(parse_versions("not json").is_empty());
        assert!(parse_versions(r#"{"versions":[{"id":"x","name":"x","mcVersion":"1.21.1","zip":"../evil"}]}"#).is_empty());

        let mut list = vec![bundled[0].clone()];
        let mut replacement = bundled[0].clone();
        replacement.name = "Updated".into();
        let extra = SoulClientVersion {
            id: "9.9".into(),
            name: "New".into(),
            mc_version: "9.9".into(),
            loader_version: String::new(),
            zip: "client/version-9.9/soul-client.zip".into(),
            mod_count: 0,
            released: String::new(),
            notes: String::new(),
        };
        merge_versions(&mut list, vec![replacement, extra]);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Updated");
        assert_eq!(list[1].id, "9.9");
    }

    #[test]
    fn bundled_filenames_match_manifest_titles() {
        let mods = vec![
            test_mod("sodium", "Sodium"),
            test_mod("sodium-extra", "Sodium Extra"),
            test_mod("dynamic-fps", "Dynamic FPS"),
        ];
        assert_eq!(display_name_for_file("sodium-fabric-0.9.2+mc26.2.jar", &mods), "Sodium");
        assert_eq!(display_name_for_file("sodium-extra-fabric-0.9.2+mc26.2.jar", &mods), "Sodium Extra");
        assert_eq!(display_name_for_file("dynamicfps-4.0.0.jar", &mods), "Dynamic FPS");
        assert_eq!(display_name_for_file("mystery-tweak-1.0.0.jar", &mods), "mystery tweak 1.0.0");
    }
}
