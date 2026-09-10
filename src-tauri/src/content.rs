//! Content: Modrinth + CurseForge. Mods, resource packs and shader packs,
//! each installed into the right subfolder of a Space.

use crate::remote::CF_KEY;
use crate::spaces::{space_dir, space_mods_dir, SpaceMod};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

pub const MODRINTH: &str = "https://api.modrinth.com/v2";
pub const CURSEFORGE: &str = "https://api.curseforge.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentHit {
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: String,
    pub source: String, // modrinth | curseforge
    #[serde(default)]
    pub game_versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentDetails {
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: String,
    pub source: String,
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    /// Page identifiers used by the popup: Modrinth needs `slug` plus
    /// `project_type` to build its canonical page URL, while CurseForge
    /// carries its own website link.
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub project_type: String,
    #[serde(default)]
    pub page_url: String,
}

/// mod | resourcepack | shader | datapack
pub fn kind_folder(kind: &str) -> &'static str {
    match kind {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        "datapack" => "datapacks",
        _ => "mods",
    }
}

/// The folder a piece of content lives in. Datapacks are special: they are
/// per-world (`saves/<world>/datapacks`) unless parked in the Space library.
pub fn content_dir(root: &PathBuf, space_id: &str, kind: &str, world: Option<&str>) -> PathBuf {
    if kind == "datapack" {
        match world.map(str::trim).filter(|w| !w.is_empty()) {
            Some(w) => crate::spaces::space_dir(root, space_id)
                .join("saves")
                .join(sanitize_world_name(w))
                .join("datapacks"),
            None => crate::spaces::space_dir(root, space_id).join(kind_folder(kind)),
        }
    } else if kind == "mod" {
        space_mods_dir(root, space_id)
    } else {
        space_dir(root, space_id).join(kind_folder(kind))
    }
}

/// World folder names come from disk listings, but treat them as untrusted.
fn sanitize_world_name(w: &str) -> String {
    w.chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect()
}

// ---------------------------------------------------------------------------
// Search

pub async fn search_content(
    http: &reqwest::Client,
    source: &str,
    kind: &str,
    query: &str,
    mc_version: &str,
    loader: &str,
    index: &str,
    offset: u32,
) -> Result<(Vec<ContentHit>, u64), String> {
    match source {
        "curseforge" => cf_search(http, kind, query, mc_version, loader, offset).await,
        _ => mr_search(http, kind, query, mc_version, loader, index, offset).await,
    }
}

async fn mr_search(
    http: &reqwest::Client,
    kind: &str,
    query: &str,
    mc_version: &str,
    loader: &str,
    index: &str,
    offset: u32,
) -> Result<(Vec<ContentHit>, u64), String> {
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{kind}")]];
    if !mc_version.is_empty() {
        facets.push(vec![format!("versions:{mc_version}")]);
    }
    // Loader categories: mods are tagged with the loader name, but shader packs
    // are tagged "iris"/"optifine" on Modrinth — filtering shaders by
    // "categories:fabric" always returned zero results. Packs and datapacks
    // are likewise not reliably loader-tagged, so no loader facet for them.
    if !loader.is_empty() && !kind_ignores_loader(kind) {
        if kind == "shader" {
            let cats: Vec<String> = if loader == "optifine" {
                vec!["categories:optifine".to_string()]
            } else if loader != "vanilla" {
                vec!["categories:iris".to_string(), "categories:optifine".to_string()]
            } else {
                vec![]
            };
            if !cats.is_empty() {
                facets.push(cats);
            }
        } else if loader != "vanilla" {
            facets.push(vec![format!("categories:{loader}")]);
        }
    }
    let facets_str = serde_json::to_string(&facets).map_err(|e| e.to_string())?;

    let resp: Value = http
        .get(format!("{MODRINTH}/search"))
        .query(&[
            ("limit", "24".to_string()),
            ("offset", offset.to_string()),
            ("query", query.to_string()),
            ("index", index.to_string()),
            ("facets", facets_str),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let total = resp.get("total_hits").and_then(|x| x.as_u64()).unwrap_or(0);
    let hits = resp
        .get("hits")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|h| ContentHit {
            project_id: h
                .get("project_id")
                .or_else(|| h.get("slug"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            title: h.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            description: h
                .get("description")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            author: h.get("author").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            downloads: h.get("downloads").and_then(|x| x.as_u64()).unwrap_or(0),
            icon_url: h
                .get("icon_url")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            source: "modrinth".into(),
            game_versions: h
                .get("versions")
                .and_then(|x| x.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
        })
        .collect();
    Ok((hits, total))
}

fn cf_class(kind: &str) -> u32 {
    match kind {
        "resourcepack" => 12,
        "shader" => 6552,
        "datapack" => 6947,
        "modpack" => 4471,
        _ => 6,
    }
}

/// Kinds that must never be filtered by mod loader — packs/datapacks are not
/// loader-tagged the way mods are, and asking for a loader returns nothing.
pub fn kind_ignores_loader(kind: &str) -> bool {
    matches!(kind, "resourcepack" | "datapack" | "modpack")
}

fn cf_loader(loader: &str) -> Option<u32> {
    match loader {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

/// GET with one rate-limit-aware retry. Returns (status, json-or-error-text).
async fn cf_get(http: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    for attempt in 1..=2 {
        let resp = http
            .get(url)
            .header("x-api-key", CF_KEY)
            .query(query)
            .send()
            .await
            .map_err(|e| format!("CurseForge unreachable: {e}"))?;
        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS && attempt == 1 {
            // Honor Retry-After when sane; otherwise wait briefly and retry once.
            let wait = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<u64>().ok())
                .unwrap_or(2)
                .clamp(1, 5);
            tokio::time::sleep(std::time::Duration::from_secs(wait)).await;
            continue;
        }
        if !status.is_success() {
            return Err(match status.as_u16() {
                403 => "CurseForge rejected this build's API key".to_string(),
                429 => "CurseForge is rate-limiting us — try again in a moment".to_string(),
                _ => format!("CurseForge error {status}"),
            });
        }
        return resp.json::<Value>().await.map_err(|e| e.to_string());
    }
    Err("CurseForge is rate-limiting us — try again in a moment".into())
}

async fn cf_search(
    http: &reqwest::Client,
    kind: &str,
    query: &str,
    mc_version: &str,
    loader: &str,
    offset: u32,
) -> Result<(Vec<ContentHit>, u64), String> {
    if CF_KEY.is_empty() {
        return Err("CurseForge is not configured in this build".into());
    }

    // Many projects are simply never tagged with a game version or a mod
    // loader, so a strict filter silently hides them. Search progressively:
    // strict -> drop loader -> drop both. The first non-empty answer wins.
    let attempts: Vec<(&str, &str)> = if kind_ignores_loader(kind) {
        vec![(mc_version, ""), ("", "")]
    } else {
        match (mc_version.is_empty(), loader.is_empty()) {
            (false, false) => vec![(mc_version, loader), (mc_version, ""), ("", "")],
            (false, true) => vec![(mc_version, ""), ("", "")],
            _ => vec![("", "")],
        }
    };

    let mut last_err: Option<String> = None;
    for (version, ld) in attempts {
        let mut q: Vec<(&str, String)> = vec![
            ("gameId", "432".into()),
            ("classId", cf_class(kind).to_string()),
            ("searchFilter", query.to_string()),
            ("sortField", "2".into()), // popularity
            ("sortOrder", "desc".into()),
            ("pageSize", "24".into()),
            ("index", offset.to_string()),
        ];
        if !version.is_empty() {
            q.push(("gameVersion", version.to_string()));
        }
        if let Some(l) = cf_loader(ld) {
            q.push(("modLoaderType", l.to_string()));
        }
        match cf_get(http, &format!("{CURSEFORGE}/mods/search"), &q).await {
            Ok(resp) => {
                let total = resp
                    .get("pagination")
                    .and_then(|p| p.get("totalCount"))
                    .and_then(|x| x.as_u64())
                    .unwrap_or(0);
                let hits = parse_cf_hits(&resp);
                if !hits.is_empty() || offset > 0 || version.is_empty() && ld.is_empty() {
                    return Ok((hits, total));
                }
                // Genuinely zero results even relaxed — keep trying stricter
                // relaxations only while there are filters left to drop.
            }
            Err(e) => last_err = Some(e),
        }
    }
    match last_err {
        Some(e) => Err(e),
        None => Ok((vec![], 0)),
    }
}

fn parse_cf_hits(resp: &Value) -> Vec<ContentHit> {
    resp.get("data")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|m| ContentHit {
            project_id: m.get("id").and_then(|x| x.as_u64()).map(|n| n.to_string()).unwrap_or_default(),
            title: m.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            description: m.get("summary").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            author: m
                .get("authors")
                .and_then(|a| a.as_array())
                .and_then(|a| a.first())
                .and_then(|a| a.get("name"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            downloads: m.get("downloadCount").and_then(|x| x.as_u64()).unwrap_or(0),
            icon_url: m
                .get("logo")
                .and_then(|l| l.get("thumbnailUrl"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            source: "curseforge".into(),
            game_versions: m
                .get("gameVersions")
                .and_then(|x| x.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Install

/// Install a piece of content into a space. Returns the recorded SpaceMod.
pub async fn install_content(
    http: &reqwest::Client,
    root: &PathBuf,
    space_id: &str,
    source: &str,
    kind: &str,
    project_id: &str,
    mc_version: &str,
    loader: &str,
) -> Result<SpaceMod, String> {
    let (title, icon_url, version_number, filename, url, sha1, size) = match source {
        "curseforge" => cf_resolve(http, project_id, mc_version, loader).await?,
        _ => mr_resolve(http, project_id, mc_version, loader).await?,
    };

    let dir = content_dir(root, space_id, kind, None);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(&filename);
    let task = crate::download::DownloadTask {
        url,
        dest: dest.clone(),
        sha1,
        size,
    };
    crate::download::download_all(http.clone(), vec![task], 2, std::sync::Arc::new(|_, _| {}))
        .await?;

    Ok(SpaceMod {
        project_id: format!("{source}:{project_id}"),
        title,
        icon_url,
        version_number,
        file_name: filename,
        kind: kind.to_string(),
        world: None,
    })
}

async fn mr_resolve(
    http: &reqwest::Client,
    project_id: &str,
    mc_version: &str,
    loader: &str,
) -> Result<(String, String, String, String, String, Option<String>, u64), String> {
    // project info (title + icon)
    let proj: Value = http
        .get(format!("{MODRINTH}/project/{project_id}"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let proj_type = proj
        .get("project_type")
        .and_then(|x| x.as_str())
        .unwrap_or("mod")
        .to_string();
    let title = proj
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or(project_id)
        .to_string();
    let icon_url = proj
        .get("icon_url")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let mut query: Vec<(&str, String)> = vec![("game_versions", format!(r#"["{mc_version}"]"#))];
    // Shader packs are tagged "iris"/"optifine" (not fabric/forge) in the
    // Modrinth version loaders field — asking for loaders:["fabric"] on a
    // shader always returned an empty list.
    if proj_type == "shader" {
        if loader == "optifine" {
            query.push(("loaders", r#"["optifine"]"#.to_string()));
        } else if loader != "vanilla" {
            query.push(("loaders", r#"["iris","optifine"]"#.to_string()));
        }
    } else if !loader.is_empty() && loader != "vanilla" && proj_type != "resourcepack" {
        query.push(("loaders", format!(r#"["{loader}"]"#)));
    }
    let fetch_versions = |loaders_filter: bool| {
        let mut q: Vec<(&str, String)> = vec![("game_versions", format!(r#"["{mc_version}"]"#))];
        if loaders_filter {
            for (k, v) in query.iter() {
                if *k == "loaders" {
                    q.push((k, v.clone()));
                }
            }
        }
        http.get(format!("{MODRINTH}/project/{project_id}/version"))
            .query(&q)
            .send()
    };
    let resp = fetch_versions(true)
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("No version of {title} for Minecraft {mc_version} ({e})"))?;
    let mut versions: Value = resp.json().await.map_err(|e| e.to_string())?;
    // Some shader packs are not tagged at all — retry without the loader
    // filter before giving up.
    if versions.as_array().map(|a| a.is_empty()).unwrap_or(true) && proj_type == "shader" {
        if let Ok(resp) = fetch_versions(false).await {
            if let Ok(r) = resp.error_for_status().map_err(|e| e.to_string()) {
                if let Ok(v) = r.json::<Value>().await {
                    versions = v;
                }
            }
        }
    }

    let version = versions
        .as_array()
        .and_then(|a| a.first().cloned())
        .ok_or_else(|| format!("No support: {title} does not support Minecraft {mc_version}"))?;

    let files = version
        .get("files")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let file = files
        .iter()
        .find(|f| {
            f.get("primary")
                .and_then(|x| x.as_bool())
                .unwrap_or(false)
        })
        .or_else(|| {
            files.iter().find(|f| {
                f.get("filename")
                    .and_then(|x| x.as_str())
                    .map(|n| n.ends_with(".jar") || n.ends_with(".zip"))
                    .unwrap_or(false)
            })
        })
        .or_else(|| files.first())
        .cloned()
        .ok_or("This content has no downloadable file")?;

    let url = file
        .get("url")
        .and_then(|x| x.as_str())
        .ok_or("Bad file")?
        .to_string();
    let filename = file
        .get("filename")
        .and_then(|x| x.as_str())
        .unwrap_or("file.bin")
        .to_string();
    let sha1 = file
        .get("hashes")
        .and_then(|h| h.get("sha1"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let version_number = version
        .get("version_number")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let size = file.get("size").and_then(|x| x.as_u64()).unwrap_or(0);

    Ok((title, icon_url, version_number, filename, url, sha1, size))
}

/// Fetch the full project description for the details popup. This is kept
/// separate from search so the browser stays quick and only downloads the
/// larger markdown body when the user asks for it.
pub async fn content_details(
    http: &reqwest::Client,
    source: &str,
    project_id: &str,
) -> Result<ContentDetails, String> {
    let (url, key) = if source == "curseforge" {
        (format!("{CURSEFORGE}/mods/{project_id}"), true)
    } else {
        (format!("{MODRINTH}/project/{project_id}"), false)
    };
    let request = http.get(url);
    let request = if key { request.header("x-api-key", CF_KEY) } else { request };
    let raw: Value = request
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let data = if key { raw.get("data").cloned().unwrap_or(raw) } else { raw };
    let title = data
        .get("title")
        .or_else(|| data.get("name"))
        .and_then(|x| x.as_str())
        .unwrap_or(project_id)
        .to_string();
    let description = data
        .get("description")
        .or_else(|| data.get("summary"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let body = data
        .get("body")
        .and_then(|x| x.as_str())
        .unwrap_or(&description)
        .to_string();
    let author = data
        .get("author")
        .and_then(|x| x.as_str())
        .or_else(|| data.get("authors").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|x| x.get("name")).and_then(|x| x.as_str()))
        .unwrap_or("")
        .to_string();
    let icon_url = data
        .get("icon_url")
        .or_else(|| data.get("logo").and_then(|x| x.get("thumbnailUrl")))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let downloads = data
        .get("downloads")
        .or_else(|| data.get("downloadCount"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let game_versions = data
        .get("game_versions")
        .or_else(|| data.get("gameVersions"))
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    // Modrinth exposes loaders/categories arrays directly; CurseForge only
    // carries loader ids on latestFilesIndexes (0 Any, 1 Forge, 2 Cauldron,
    // 3 LiteLoader, 4 Fabric, 5 Quilt, 6 NeoForge).
    let mut loaders: Vec<String> = data
        .get("loaders")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if loaders.is_empty() {
        if let Some(indexes) = data.get("latestFilesIndexes").and_then(|x| x.as_array()) {
            let mut found: Vec<String> = indexes
                .iter()
                .filter_map(|v| v.get("modLoader").and_then(|m| m.as_u64()))
                .filter_map(|id| match id { 1 => Some("forge"), 4 => Some("fabric"), 5 => Some("quilt"), 6 => Some("neoforge"), _ => None })
                .map(str::to_string)
                .collect();
            found.sort();
            found.dedup();
            loaders = found;
        }
    }
    let categories: Vec<String> = data
        .get("categories")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).take(6).collect())
        .unwrap_or_default();
    let slug = data
        .get("slug")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let project_type = data
        .get("project_type")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    // CurseForge already knows its canonical project page.
    let page_url = data
        .get("links")
        .and_then(|x| x.get("websiteUrl"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    Ok(ContentDetails { project_id: project_id.to_string(), title, description, body, author, downloads, icon_url, source: source.to_string(), game_versions, loaders, categories, slug, project_type, page_url })
}

async fn cf_resolve(
    http: &reqwest::Client,
    project_id: &str,
    mc_version: &str,
    loader: &str,
) -> Result<(String, String, String, String, String, Option<String>, u64), String> {
    if CF_KEY.is_empty() {
        return Err("CurseForge is not configured in this build".into());
    }
    let proj: Value = http
        .get(format!("{CURSEFORGE}/mods/{project_id}"))
        .header("x-api-key", CF_KEY)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let proj = proj.get("data").cloned().unwrap_or(Value::Null);
    let title = proj
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or(project_id)
        .to_string();
    let icon_url = proj
        .get("logo")
        .and_then(|l| l.get("thumbnailUrl"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let mut q: Vec<(&str, String)> = vec![("pageSize", "10".into())];
    if !mc_version.is_empty() {
        q.push(("gameVersion", mc_version.into()));
    }
    if let Some(l) = cf_loader(loader) {
        q.push(("modLoaderType", l.to_string()));
    }
    let files_resp: Value = http
        .get(format!("{CURSEFORGE}/mods/{project_id}/files"))
        .header("x-api-key", CF_KEY)
        .query(&q)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let files = files_resp
        .get("data")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let file = files
        .first()
        .cloned()
        .ok_or_else(|| format!("{title} has no file for Minecraft {mc_version}"))?;

    let file_id = file.get("id").and_then(|x| x.as_u64()).ok_or("Bad file")?;
    let filename = file
        .get("fileName")
        .and_then(|x| x.as_str())
        .unwrap_or("file.jar")
        .to_string();
    let size = file
        .get("fileLength")
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let version_number = file
        .get("displayName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let sha1 = file
        .get("hashes")
        .and_then(|x| x.as_array())
        .and_then(|a| {
            a.iter()
                .find(|h| h.get("algo").and_then(|x| x.as_u64()) == Some(1))
                .and_then(|h| h.get("value"))
                .and_then(|x| x.as_str())
        })
        .map(|s| s.to_string());

    // direct URL or fetch via download-url endpoint
    let url = match file.get("downloadUrl").and_then(|x| x.as_str()) {
        Some(u) if !u.is_empty() => u.to_string(),
        _ => http
            .get(format!(
                "{CURSEFORGE}/mods/{project_id}/files/{file_id}/download-url"
            ))
            .header("x-api-key", CF_KEY)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json::<Value>()
            .await
            .map_err(|e| e.to_string())?
            .get("data")
            .and_then(|x| x.as_str())
            .ok_or("CurseForge blocked this file's download")?
            .to_string(),
    };

    Ok((title, icon_url, version_number, filename, url, sha1, size))
}

pub fn remove_content_file(root: &PathBuf, space_id: &str, kind: &str, world: Option<&str>, file_name: &str) -> Result<(), String> {
    let p = content_dir(root, space_id, kind, world).join(file_name);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Metadata counts as installed only while its file exists in the Space.
pub fn content_file_exists(root: &PathBuf, space_id: &str, kind: &str, world: Option<&str>, file_name: &str) -> bool {
    if file_name.trim().is_empty() { return false; }
    content_dir(root, space_id, kind, world).join(file_name).is_file()
}
