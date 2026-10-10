//! Modpack installs and local content imports.
//!
//! Two pack formats are supported, and both always become a NEW Space —
//! a pack bundles its own Minecraft version + loader, so merging one into an
//! existing Space would break both:
//! - Modrinth `.mrpack`: a zip whose `modrinth.index.json` lists every file
//!   with direct download URLs and SHA-1 hashes.
//! - CurseForge: a manifest `.zip` (`manifest.json`) with projectID/fileID
//!   pairs resolved through the CurseForge API, plus an `overrides/` tree.
//!
//! Plain `.jar`/`.zip` drops are sniffed (mod / shader / resourcepack /
//! datapack) and copied straight into a Space's folders.

use crate::content::CURSEFORGE;
use crate::remote::CF_KEY;
use crate::spaces::{space_dir, SpaceMod};
use futures_util::StreamExt;
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

const MAX_INDEX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct PackFile {
    pub url: String,
    /// Sanitized relative path under the Space directory (forward slashes).
    pub rel_path: String,
    pub sha1: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct PackPlan {
    pub name: String,
    #[allow(dead_code)] // carried for pack details views
    pub summary: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub files: Vec<PackFile>,
    /// Temp directory holding the pack's `overrides` tree (copied into the
    /// Space root after downloads finish). Cleaned up by the caller.
    pub overrides_dir: Option<PathBuf>,
}

impl PackPlan {
    /// Free the temp overrides tree (call when done installing).
    pub fn cleanup(&mut self) {
        if let Some(dir) = self.overrides_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

// ---------------------------------------------------------------------------
// zip helpers

type MemZip<'a> = zip::ZipArchive<std::io::Cursor<&'a [u8]>>;

fn open_zip(bytes: &[u8]) -> Result<MemZip<'_>, String> {
    zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("Not a valid zip archive: {e}"))
}

fn read_zip_entry(arch: &mut MemZip<'_>, name: &str) -> Result<Vec<u8>, String> {
    let mut f = arch
        .by_name(name)
        .map_err(|_| format!("This pack is missing {name} — is it really a modpack?"))?;
    if f.size() > MAX_INDEX_BYTES as u64 {
        return Err(format!("{name} is implausibly large"));
    }
    let mut buf = Vec::with_capacity(f.size() as usize);
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Turn an archive member name into a safe relative path. Rejects absolute
/// paths, `..` climbs, drive letters and NUL bytes — a crafted pack must not
/// be able to write anywhere outside its own Space.
pub fn safe_rel_path(raw: &str) -> Option<String> {
    let normalized = raw.replace('\\', "/");
    if normalized.starts_with('/') || normalized.contains('\0') {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            p => {
                if p.contains(':') {
                    return None;
                }
                parts.push(p);
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

// ---------------------------------------------------------------------------
// Modrinth .mrpack

pub fn plan_from_mrpack(bytes: &[u8]) -> Result<PackPlan, String> {
    let mut arch = open_zip(bytes)?;
    let raw = read_zip_entry(&mut arch, "modrinth.index.json")?;
    let index: Value =
        serde_json::from_slice(&raw).map_err(|_| "modrinth.index.json is not valid JSON")?;

    if index.get("game").and_then(|g| g.as_str()) != Some("minecraft") {
        return Err("This .mrpack is not a Minecraft modpack".into());
    }

    let deps = index.get("dependencies").cloned().unwrap_or(Value::Null);
    let mc_version = deps
        .get("minecraft")
        .and_then(|v| v.as_str())
        .ok_or("The pack does not say which Minecraft version it needs")?
        .to_string();
    let (loader, loader_version) = parse_dependency_loaders(&deps);

    let name = clean_text(index.get("name"), 32, "Modpack");
    let summary = clean_text(index.get("summary"), 160, "");

    let mut files = Vec::new();
    for f in index
        .get("files")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
    {
        // env.client: required | optional | unsupported. Missing means required.
        let env = f
            .pointer("/env/client")
            .and_then(|v| v.as_str())
            .unwrap_or("required");
        if env == "unsupported" {
            continue;
        }
        let rel = match f.get("path").and_then(|v| v.as_str()).and_then(safe_rel_path) {
            Some(p) => p,
            None => continue,
        };
        let url = match f
            .get("downloads")
            .and_then(|d| d.as_array())
            .and_then(|a| a.first())
            .and_then(|u| u.as_str())
        {
            Some(u) if u.starts_with("https://") => u.to_string(),
            _ => continue,
        };
        files.push(PackFile {
            url,
            rel_path: rel,
            sha1: f
                .pointer("/hashes/sha1")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            size: f.get("fileSize").and_then(|v| v.as_u64()).unwrap_or(0),
        });
    }
if files.is_empty() {
        return Err("This pack lists no downloadable files".into());
    }

    // Modrinth packs carry their configs/mods in `overrides/` exactly like
    // CurseForge zips; it must be merged into the Space or bundled content
    // (custom Soul Client mods, configs) silently disappears.
    let overrides_dir = extract_tree_to_temp(&mut arch, "overrides/")?;

    Ok(PackPlan {
        name,
        summary,
        mc_version,
        loader,
        loader_version,
        files,
        overrides_dir,
    })
}

/// Map Modrinth dependency keys onto our loader ids.
fn parse_dependency_loaders(deps: &Value) -> (String, Option<String>) {
    if let Some(map) = deps.as_object() {
        for (key, val) in map {
            let ver = val.as_str().filter(|s| !s.is_empty()).map(str::to_string);
            match key.as_str() {
                "fabric-loader" => return ("fabric".into(), ver),
                "quilt-loader" => return ("quilt".into(), ver),
                "forge" => return ("forge".into(), ver),
                "neoforge" => return ("neoforge".into(), ver),
                _ => {}
            }
        }
    }
    ("vanilla".into(), None)
}

// ---------------------------------------------------------------------------
// CurseForge manifest packs

/// Bytes-only variant (builds a short-lived client) for local file imports.
pub async fn plan_from_cf_zip_bytes(bytes: &[u8]) -> Result<PackPlan, String> {
    let http = reqwest::Client::builder()
        .user_agent(concat!("SoulLauncher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    plan_from_cf_zip(&http, bytes).await
}

pub async fn plan_from_cf_zip(http: &reqwest::Client, bytes: &[u8]) -> Result<PackPlan, String> {
    if CF_KEY.is_empty() {
        return Err("CurseForge is not configured in this build".into());
    }
    let mut arch = open_zip(bytes)?;
    let raw = read_zip_entry(&mut arch, "manifest.json")
        .map_err(|_| "This zip has no manifest.json — it is not a CurseForge modpack".to_string())?;
    let manifest: Value =
        serde_json::from_slice(&raw).map_err(|_| "manifest.json is not valid JSON")?;

    let mc_version = manifest
        .pointer("/minecraft/version")
        .and_then(|v| v.as_str())
        .ok_or("The pack does not say which Minecraft version it needs")?
        .to_string();
    let (loader, loader_version) = parse_cf_modloaders(manifest.pointer("/minecraft/modLoaders"));

    let name = clean_text(manifest.get("name"), 32, "Modpack");
    let author = clean_text(manifest.get("author"), 40, "");
    let pack_ver = clean_text(manifest.get("version"), 20, "");

    // Resolve every required file through the API, six at a time.
    let wanted: Vec<(u64, u64)> = manifest
        .get("files")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let pid = f.get("projectID").and_then(|v| v.as_u64())?;
            let fid = f.get("fileID").and_then(|v| v.as_u64())?;
            let required = f.get("required").and_then(|v| v.as_bool()).unwrap_or(true);
            required.then_some((pid, fid))
        })
        .collect();

    let results = futures_util::stream::iter(wanted.into_iter().map(|(pid, fid)| {
        let http = http.clone();
        async move { resolve_cf_file(&http, pid, fid).await }
    }))
    .buffer_unordered(6)
    .collect::<Vec<_>>()
    .await;

    let mut files = Vec::new();
    let mut failures = 0usize;
    for r in results {
        match r {
            Ok(f) => files.push(f),
            Err(_) => failures += 1,
        }
    }
    if files.is_empty() {
        return Err("None of this pack's files could be resolved on CurseForge".into());
    }

    let overrides_root = manifest
        .get("overrides")
        .and_then(|v| v.as_str())
        .unwrap_or("overrides")
        .trim_matches('/')
        .to_string();
    let overrides_dir = extract_tree_to_temp(&mut arch, &format!("{overrides_root}/"))?;

    let mut summary = [author, pack_ver].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ");
    if failures > 0 {
        let note = format!("{failures} file(s) unavailable — they were skipped");
        summary = if summary.is_empty() { note } else { format!("{summary} · {note}") };
    }

    Ok(PackPlan {
        name,
        summary,
        mc_version,
        loader,
        loader_version,
        files,
        overrides_dir,
    })
}

fn parse_cf_modloaders(mls: Option<&Value>) -> (String, Option<String>) {
    let arr = match mls.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return ("vanilla".into(), None),
    };
    let mut first_known: Option<(String, Option<String>)> = None;
    for ml in arr {
        let id = match ml.get("id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => continue,
        };
        let parsed = id.split_once('-').and_then(|(n, v)| match n {
            "fabric" | "quilt" | "forge" | "neoforge" => {
                Some((n.to_string(), (!v.is_empty()).then(|| v.to_string())))
            }
            _ => None,
        });
        if let Some(p) = parsed {
            let primary = ml.get("primary").and_then(|v| v.as_bool()).unwrap_or(false);
            if primary {
                return p;
            }
            if first_known.is_none() {
                first_known = Some(p);
            }
        }
    }
    first_known.unwrap_or_else(|| ("vanilla".into(), None))
}

async fn resolve_cf_file(
    http: &reqwest::Client,
    project_id: u64,
    file_id: u64,
) -> Result<PackFile, String> {
    let resp: Value = http
        .get(format!("{CURSEFORGE}/mods/{project_id}/files/{file_id}"))
        .header("x-api-key", CF_KEY)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let data = resp.get("data").cloned().unwrap_or(resp);

    let file_name = data
        .get("fileName")
        .and_then(|v| v.as_str())
        .ok_or("CurseForge file entry has no name")?
        .replace('\\', "/");
    let file_name = safe_rel_path(&file_name).ok_or("Bad file name in pack")?;

let url = match data.get("downloadUrl").and_then(|v| v.as_str()) {
        Some(u) if !u.is_empty() && u.starts_with("https://") => u.to_string(),
        // The raw API file route needs the x-api-key header, which the
        // downloader does not send. Resolve the real CDN link instead (and
        // fail cleanly when CurseForge blocks distribution).
        _ => crate::remote::cf_download_url(http, &project_id.to_string(), file_id)
            .await
            .map_err(|_| "CurseForge blocked this file's download".to_string())?,
    };

    // Manifests don't label folders; the extension is the convention packs use.
    let folder = if file_name.to_ascii_lowercase().ends_with(".zip") {
        "resourcepacks"
    } else {
        "mods"
    };

    Ok(PackFile {
        url,
        rel_path: format!("{folder}/{file_name}"),
        sha1: data
            .get("hashes")
            .and_then(|h| h.as_array())
            .and_then(|a| {
                a.iter()
                    .find(|h| h.get("algo").and_then(|x| x.as_u64()) == Some(1))
                    .and_then(|h| h.get("value"))
                    .and_then(|x| x.as_str())
            })
            .map(str::to_string),
        size: data.get("fileLength").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

/// Copy `<prefix>…` members of the archive into a fresh temp directory so the
/// caller can merge them into the Space once downloads succeed.
fn extract_tree_to_temp(arch: &mut MemZip<'_>, prefix: &str) -> Result<Option<PathBuf>, String> {
    // Collect by index: archive member names are stored verbatim (directory
    // entries keep their trailing '/'), while `safe_rel_path` normalizes them.
    // A by_name lookup with the normalized path would miss every directory.
    let mut entries: Vec<(String, String, bool)> = Vec::new();
    for i in 0..arch.len() {
        let Some(raw_name) = arch.name_for_index(i).map(str::to_string) else { continue };
        // Zips written by .NET/Windows tools may use `\` separators; match on
        // the normalized name but read the entry back by its original name.
        let normalized = raw_name.replace('\\', "/");
        let Some(rest) = normalized.strip_prefix(prefix) else { continue };
        let Some(rel) = safe_rel_path(rest) else { continue };
        let is_dir = arch.by_index(i).map(|f| f.is_dir()).unwrap_or(false);
        entries.push((raw_name, rel, is_dir));
    }
    if entries.is_empty() {
        return Ok(None);
    }
    let dir = std::env::temp_dir().join(format!("soul-pack-{}", uuid::Uuid::new_v4()));
    for (name, rel, is_dir) in entries {
        let dest = dir.join(&rel);
        if is_dir {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        let mut f = arch.by_name(&name).map_err(|e| e.to_string())?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(Some(dir))
}

// ---------------------------------------------------------------------------
// Installing a plan into a Space

/// Build SpaceMod records for every planned file (call after downloads land).
pub fn records_for_plan(plan: &PackPlan) -> Vec<SpaceMod> {
    plan.files
        .iter()
        .map(|f| {
            let file_name = f.rel_path.rsplit('/').next().unwrap_or(&f.rel_path).to_string();
            let kind = match f.rel_path.split('/').next().unwrap_or("") {
                "resourcepacks" => "resourcepack",
                "shaderpacks" => "shader",
                "datapacks" => "datapack",
                _ => "mod",
            };
            let title: String = file_name.chars().take(80).collect();
            SpaceMod {
                // NOTE: bare "local:" id — unique per folder, which is all the
                // browser needs; packs rarely ship two same-named files anyway.
                project_id: format!("local:{file_name}"),
                title,
                icon_url: String::new(),
                version_number: String::new(),
                file_name,
                kind: kind.to_string(),
                world: None,
            }
        })
        .collect()
}

pub async fn install_plan_files(
    root: &PathBuf,
    http: reqwest::Client,
    space_id: &str,
    plan: &PackPlan,
    progress: Arc<dyn Fn(u64, u64) + Send + Sync>,
) -> Result<(), String> {
    let base = space_dir(root, space_id);
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let tasks: Vec<crate::download::DownloadTask> = plan
        .files
        .iter()
        .map(|f| crate::download::DownloadTask {
            url: f.url.clone(),
            dest: base.join(&f.rel_path),
            sha1: f.sha1.clone(),
            size: f.size,
        })
        .collect();
    crate::download::download_all(http, tasks, 6, progress).await?;

    // Merge overrides last so downloaded files win over packed ones.
    if let Some(tree) = &plan.overrides_dir {
        copy_tree(tree, &base)?;
    }
    Ok(())
}

fn copy_tree(from: &PathBuf, to_base: &PathBuf) -> Result<(), String> {
    for entry in walk(from) {
        let rel = entry
            .strip_prefix(from)
            .map_err(|_| "bad override path".to_string())?;
        let dest = to_base.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let _ = std::fs::copy(&entry, &dest);
        }
    }
    Ok(())
}

fn walk(dir: &PathBuf) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.clone()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}

// ---------------------------------------------------------------------------
// Local content uploads (plain jars/zips)

/// Best-effort sniffing of what a dropped file actually is, by looking inside
/// the archive. Order matters: mod markers beat everything, then shaders,
/// then datapack vs resourcepack (data/ vs assets/ next to pack.mcmeta).
pub fn sniff_kind(path: &std::path::Path) -> &'static str {
    let lower = path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase());
    match lower.as_deref() {
        Some("jar") | Some("zip") | Some("litemod") => {}
        _ => return "mod",
    }
    let Ok(file) = std::fs::File::open(path) else { return "mod" };
    let Ok(mut arch) = zip::ZipArchive::new(file) else { return "mod" };

    let mut has_pack_mcmeta = false;
    let mut has_data = false;
    let mut has_assets = false;
    let mut has_shaders = false;

    for i in 0..arch.len() {
        let Ok(name) = arch.by_index(i).map(|f| f.name().to_string()) else { continue };
        let n = name.replace('\\', "/");
        if n.ends_with("fabric.mod.json")
            || n.ends_with("quilt.mod.json")
            || n.ends_with("META-INF/mods.toml")
            || n.ends_with("mcmod.info")
            || n.ends_with("mods.toml")
        {
            return "mod";
        }
        if n == "pack.mcmeta" || n.ends_with("/pack.mcmeta") {
            has_pack_mcmeta = true;
        }
        let top = n.split('/').find(|s| !s.is_empty());
        match top {
            Some("data") => has_data = true,
            Some("assets") => has_assets = true,
            Some("shaders") => has_shaders = true,
            _ => {}
        }
        if n.starts_with("shaders/") {
            has_shaders = true;
        }
    }

    if has_shaders {
        "shader"
    } else if has_pack_mcmeta && has_data && !has_assets {
        "datapack"
    } else if has_pack_mcmeta && has_assets {
        "resourcepack"
    } else {
        "mod"
    }
}

// ---------------------------------------------------------------------------

fn clean_text(v: Option<&Value>, max_chars: usize, fallback: &str) -> String {
    let s = v
        .and_then(|x| x.as_str())
        .unwrap_or(fallback)
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .to_string();
    if s.is_empty() {
        fallback.chars().take(max_chars).collect()
    } else {
        s.chars().take(max_chars).collect()
    }
}

// ---------------------------------------------------------------------------
// Tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_paths_accept_normal_and_reject_climbs() {
        assert_eq!(safe_rel_path("mods/foo.jar").as_deref(), Some("mods/foo.jar"));
        assert_eq!(safe_rel_path("config\\app.ini").as_deref(), Some("config/app.ini"));
        assert_eq!(safe_rel_path("../evil.txt"), None);
        assert_eq!(safe_rel_path("a/../../evil.txt"), None);
        assert_eq!(safe_rel_path("/abs/path"), None);
        assert_eq!(safe_rel_path("C:/windows.ini"), None);
        assert_eq!(safe_rel_path(""), None);
    }

    #[test]
    fn modrinth_loader_keys_map() {
        let deps: Value = serde_json::json!({
            "minecraft": "1.20.1",
            "fabric-loader": "0.16.9"
        });
        let (loader, ver) = parse_dependency_loaders(&deps);
        assert_eq!(loader, "fabric");
        assert_eq!(ver.as_deref(), Some("0.16.9"));

        let none: Value = serde_json::json!({ "minecraft": "1.20.1" });
        assert_eq!(parse_dependency_loaders(&none).0, "vanilla");
    }

    #[test]
    fn curseforge_loader_ids_parse() {
        let mls: Value = serde_json::json!([{ "id": "fabric-0.16.9", "primary": true }]);
        let (loader, ver) = parse_cf_modloaders(Some(&mls));
        assert_eq!(loader, "fabric");
        assert_eq!(ver.as_deref(), Some("0.16.9"));

        let forge: Value = serde_json::json!([{ "id": "forge-47.2.0", "primary": true }]);
        assert_eq!(parse_cf_modloaders(Some(&forge)).0, "forge");

        let unknown: Value = serde_json::json!([{ "id": "liteloader-1.12", "primary": true }]);
        assert_eq!(parse_cf_modloaders(Some(&unknown)).0, "vanilla");
    }

    #[test]
    fn records_infer_kinds_from_folders() {
        let plan = PackPlan {
            name: "t".into(),
            summary: String::new(),
            mc_version: "1.20.1".into(),
            loader: "fabric".into(),
            loader_version: None,
            files: vec![
                PackFile { url: String::new(), rel_path: "mods/a.jar".into(), sha1: None, size: 0 },
                PackFile { url: String::new(), rel_path: "resourcepacks/b.zip".into(), sha1: None, size: 0 },
                PackFile { url: String::new(), rel_path: "shaderpacks/c.zip".into(), sha1: None, size: 0 },
            ],
            overrides_dir: None,
        };
let recs = records_for_plan(&plan);
        assert_eq!(recs[0].kind, "mod");
        assert_eq!(recs[1].kind, "resourcepack");
        assert_eq!(recs[2].kind, "shader");
        assert!(recs[0].project_id.starts_with("local:"));
    }

    #[test]
    fn cf_overrides_with_directory_entries_extract() {
        use std::io::Write as _;

        // Real CurseForge zips list directories as their own entries with a
        // trailing '/'. Those entries used to abort the whole extraction.
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            writer.add_directory("overrides/config/", opts).unwrap();
            writer.start_file("overrides/config/app.ini", opts).unwrap();
            writer.write_all(b"x=1").unwrap();
            writer.start_file("overrides/plain.txt", opts).unwrap();
            writer.write_all(b"hi").unwrap();
            writer.finish().unwrap();
        }
        let bytes = buf.into_inner();
        let mut archive = open_zip(&bytes).unwrap();
        let tree = extract_tree_to_temp(&mut archive, "overrides/")
            .unwrap()
            .expect("overrides tree");
        assert_eq!(std::fs::read_to_string(tree.join("config").join("app.ini")).unwrap(), "x=1");
        assert_eq!(std::fs::read_to_string(tree.join("plain.txt")).unwrap(), "hi");
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn mrpack_overrides_are_extracted() {
        use std::io::Write as _;

        // Modrinth packs keep configs and bundled jars in overrides/; the
        // plan must carry them or they silently disappear on install.
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            writer.add_directory("overrides/config/", opts).unwrap();
            writer.start_file("overrides/config/soul.txt", opts).unwrap();
            writer.write_all(b"soul").unwrap();
            writer.start_file("modrinth.index.json", opts).unwrap();
            writer
                .write_all(
                    br#"{
                        "formatVersion": 1, "game": "minecraft", "versionId": "1",
                        "name": "Soul Test",
                        "files": [{
                            "path": "mods/a.jar",
                            "hashes": {"sha1": "abc", "sha512": "def"},
                            "downloads": ["https://example.com/a.jar"],
                            "fileSize": 1
                        }],
                        "dependencies": {"minecraft": "1.21.1", "fabric-loader": "0.19.5"}
                    }"#,
                )
                .unwrap();
            writer.finish().unwrap();
        }
        let bytes = buf.into_inner();
        let plan = plan_from_mrpack(&bytes).unwrap();
        assert_eq!(plan.mc_version, "1.21.1");
        assert_eq!(plan.loader, "fabric");
        assert_eq!(plan.files.len(), 1);
        let dir = plan.overrides_dir.clone().expect("overrides extracted");
        assert_eq!(std::fs::read_to_string(dir.join("config").join("soul.txt")).unwrap(), "soul");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generated_soul_mrpack_parses() {
        // Guards the shipped Soul Client packs: if the packaging script
        // changes shape, this fails before users ever see "not a modpack".
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("client")
            .join("soul-client")
            .join("Soul-Client-1.21.1.mrpack");
        let Ok(bytes) = std::fs::read(&path) else { return };
        let plan = plan_from_mrpack(&bytes)
            .unwrap_or_else(|e| panic!("generated Soul pack must parse: {e}"));
        assert_eq!(plan.mc_version, "1.21.1");
        assert!(plan.files.len() >= 18, "expected the curated mod list, got {}", plan.files.len());
        let dir = plan.overrides_dir.clone().expect("custom mods are bundled");
        assert!(dir.join("mods").is_dir());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_tree_rejects_path_climbs() {
        use std::io::Write as _;

        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            writer.start_file("overrides/../../evil.txt", opts).unwrap();
            writer.write_all(b"nope").unwrap();
            writer.start_file("overrides/ok.txt", opts).unwrap();
            writer.write_all(b"fine").unwrap();
            writer.finish().unwrap();
        }
        let bytes = buf.into_inner();
        let mut archive = open_zip(&bytes).unwrap();
        let tree = extract_tree_to_temp(&mut archive, "overrides/")
            .unwrap()
            .expect("tree with the safe file only");
        let mut names: Vec<String> = std::fs::read_dir(&tree)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["ok.txt".to_string()]);
        let _ = std::fs::remove_dir_all(&tree);
    }
}
