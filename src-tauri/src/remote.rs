//! Remote config/content from the SoulLauncher GitHub repo (public).
//! A token improves rate limits but is NOT required — fetching works with the
//! public API alone, so revoked/expired tokens can never freeze the content.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub const UPDATER_TOKEN: &str = match option_env!("SOUL_TOKEN") {
    Some(t) => t,
    None => "",
};
pub const CF_KEY: &str = match option_env!("SOUL_CF_KEY") {
    Some(t) => t,
    None => "",
};

/// Everything the launcher needs lives in this one repo: server list, home
/// pages, the mod-page iframe site, and the Soul Client zips.
/// (Single place documenting the repo; the URLs below spell it out.)
#[allow(dead_code)]
pub const REPO: &str = "unmid/SoulLauncher";
pub const REPO_BASE: &str = "https://api.github.com/repos/unmid/SoulLauncher/contents";
pub const RAW_BASE: &str = "https://raw.githubusercontent.com/unmid/SoulLauncher/main";
pub const RELEASES_REPO: &str = "unmid/SoulLauncher";

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn cache_path(root: &PathBuf, name: &str) -> PathBuf {
    root.join("cache").join("remote").join(name)
}

async fn try_get(http: &reqwest::Client, url: &str, token: bool) -> Result<String, String> {
    let mut req = http
        .get(url)
        .header("Accept", "application/vnd.github.raw+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "SoulLauncher");
    if token && !UPDATER_TOKEN.is_empty() {
        req = req.header("Authorization", format!("Bearer {UPDATER_TOKEN}"));
    }
    let bytes = req
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// Fetch a file from the SoulLauncher repo. Tries, in order:
///   1. the GitHub Contents API with the baked-in token (if present),
///   2. the same API unauthenticated (the repo is public),
///   3. raw.githubusercontent.com with a cache-busting query,
///   4. the last disk cache (offline).
/// Every successful network fetch refreshes the disk cache, so the live
/// content always wins and the cache can never hide newer updates.
pub async fn fetch_updater_file(
    http: &reqwest::Client,
    root: &PathBuf,
    file: &str,
) -> Option<String> {
    let cache = cache_path(root, &file.replace('/', "_"));
    let api_url = format!("{REPO_BASE}/{file}");
    let raw_url = format!("{RAW_BASE}/{file}?cb={}", now_ms());

    let mut result: Option<String> = None;
    if !UPDATER_TOKEN.is_empty() {
        result = try_get(http, &api_url, true).await.ok();
    }
    if result.is_none() {
        result = try_get(http, &api_url, false).await.ok();
    }
    if result.is_none() {
        result = try_get(http, &raw_url, false).await.ok();
    }

    match result {
        Some(text) => {
            if let Some(parent) = cache.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let Ok(_) = std::fs::write(&cache, &text) else {
                return Some(text);
            };
            Some(text)
        }
        None => std::fs::read_to_string(&cache).ok(),
    }
}

/// Home hero pages: looks for home/manifest.json ("pages": ["1.html", ...]) and
/// downloads every page in parallel (each one cached on disk like any updater
/// file, so the launcher still shows them offline later). Falls back to the
/// single home/index.html, then to an empty list (UI shows wallpapers).
pub async fn fetch_home_pages(http: &reqwest::Client, root: &PathBuf) -> Vec<String> {
    if let Some(manifest) = fetch_updater_file(http, root, "home/manifest.json").await {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&manifest) {
            if let Some(arr) = v.get("pages").and_then(|x| x.as_array()) {
                let names: Vec<String> = arr
                    .iter()
                    .filter_map(|p| p.as_str())
                    .take(8)
                    .map(|p| p.trim().trim_matches(|c| c == '/' || c == '\\').to_string())
                    .filter(|p| !p.is_empty() && !p.contains("..") && !p.contains(|c| c == '/' || c == '\\'))
                    .collect();
                if !names.is_empty() {
                    let mut set = tokio::task::JoinSet::new();
                    for (i, n) in names.into_iter().enumerate() {
                        let http = http.clone();
                        let root = root.clone();
                        set.spawn(async move { (i, fetch_updater_file(&http, &root, &format!("home/{n}")).await) });
                    }
                    let mut pages: Vec<(usize, String)> = Vec::new();
                    while let Some(r) = set.join_next().await {
                        if let Ok((i, Some(html))) = r {
                            if html.trim().len() > 20 {
                                pages.push((i, html));
                            }
                        }
                    }
                    if !pages.is_empty() {
                        pages.sort_by_key(|(i, _)| *i); // manifest order, not completion order
                        return pages.into_iter().map(|(_, h)| h).collect();
                    }
                }
            }
        }
    }
    // single-file home page
    if let Some(h) = fetch_updater_file(http, root, "home/index.html").await {
        if h.trim().len() > 20 {
            return vec![h];
        }
    }
    vec![]
}

/// Download any URL to bytes (for textures/icons through the backend,
/// avoiding CORS issues in the webview).
pub async fn fetch_bytes_b64(http: &reqwest::Client, url: &str) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Bad link".into());
    }
    let bytes = http
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    Ok(base64_encode(&bytes))
}

// ---------------------------------------------------------------------------
// CurseForge API helpers (shared by content search + modpack installs)

pub async fn cf_api_get(http: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    if CF_KEY.is_empty() {
        return Err("CurseForge is not configured in this build".into());
    }
    http.get(url)
        .header("x-api-key", CF_KEY)
        .send()
        .await
        .map_err(|e| format!("CurseForge unreachable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("CurseForge error: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())
}

/// Resolve a file's direct download URL through the API when the listing did
/// not include one.
pub async fn cf_download_url(
    http: &reqwest::Client,
    project_id: &str,
    file_id: u64,
) -> Result<String, String> {
    let v: serde_json::Value = cf_api_get(
        http,
        &format!("https://api.curseforge.com/v1/mods/{project_id}/files/{file_id}/download-url"),
    )
    .await?;
    v.get("data")
        .and_then(|x| x.as_str())
        .map(str::to_string)
        .ok_or_else(|| "CurseForge blocked this file's download".into())
}

const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}
