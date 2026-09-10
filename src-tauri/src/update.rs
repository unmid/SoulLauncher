//! One-click updates straight from GitHub Releases on unmid/SoulLauncher.

use crate::remote::RELEASES_REPO;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub latest: String,
    pub current: String,
    pub url: String,        // release page
    pub asset_url: String,  // installer download (empty if none attached)
    pub notes: String,
    pub published_at: String,
}

fn parse_semver(s: &str) -> Vec<u64> {
    s.trim_start_matches(['v', 'V'])
        .split('.')
        .map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

/// Is `latest` strictly newer than `current`?
pub fn is_newer(current: &str, latest: &str) -> bool {
    let a = parse_semver(current);
    let b = parse_semver(latest);
    for i in 0..3 {
        let x = *a.get(i).unwrap_or(&0);
        let y = *b.get(i).unwrap_or(&0);
        if y != x {
            return y > x;
        }
    }
    false
}

pub async fn check(http: &reqwest::Client, current: &str) -> Result<UpdateInfo, String> {
    let mut req = http
        .get(format!(
            "https://api.github.com/repos/{RELEASES_REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "SoulLauncher");
    if !crate::remote::UPDATER_TOKEN.is_empty() {
        req = req.header(
            "Authorization",
            format!("Bearer {}", crate::remote::UPDATER_TOKEN),
        );
    }
    let v: Value = req
        .send()
        .await
        .map_err(|e| format!("Can't reach GitHub: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GitHub error: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let latest = v
        .get("tag_name")
        .and_then(|x| x.as_str())
        .ok_or("Bad release data")?
        .to_string();
    let asset_url = v
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|a| {
            a.iter().find(|x| {
                x.get("name")
                    .and_then(|n| n.as_str())
                    .map(|n| n.ends_with(".exe") || n.ends_with(".msi"))
                    .unwrap_or(false)
            })
        })
        .and_then(|x| x.get("browser_download_url"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    Ok(UpdateInfo {
        available: is_newer(current, &latest),
        latest: latest.clone(),
        current: current.to_string(),
        url: v
            .get("html_url")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        asset_url,
        notes: v
            .get("body")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .chars()
            .take(4000)
            .collect(),
        published_at: v
            .get("published_at")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// Download the installer to a temp file and return its path.
pub async fn download_installer(
    http: &reqwest::Client,
    root: &PathBuf,
    url: &str,
    progress: impl Fn(u64, u64) + Send + Sync + 'static,
) -> Result<PathBuf, String> {
    let dest = root.join("cache").join("update").join(
        url.rsplit('/').next().unwrap_or("soul-update.exe"),
    );
    let task = crate::download::DownloadTask {
        url: url.to_string(),
        dest: dest.clone(),
        sha1: None,
        size: 0,
    };
    // always re-download fresh installers
    let _ = std::fs::remove_file(&dest);
    crate::download::download_all(http.clone(), vec![task], 4, std::sync::Arc::new(progress)).await?;
    Ok(dest)
}

/// Run the installer. The app should quit right after.
pub fn run_installer(path: &PathBuf) -> Result<(), String> {
    open::that_detached(path).map_err(|e| format!("Couldn't start the installer: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_compare() {
        assert!(is_newer("3.0.0", "v3.1.0"));
        assert!(is_newer("3.0.0", "3.0.1"));
        assert!(!is_newer("3.0.0", "3.0.0"));
        assert!(!is_newer("3.1.0", "3.0.9"));
    }
}
