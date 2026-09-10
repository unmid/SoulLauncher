//! Mod loaders: Fabric & Quilt via their meta APIs (profile JSON that inherits
//! vanilla). Forge & NeoForge via their official headless installers.
//! OptiFine via its installer jar from the BMCLAPI mirror.

use serde_json::Value;
use std::path::PathBuf;

pub const LOADER_KINDS: [&str; 6] = ["vanilla", "fabric", "quilt", "forge", "neoforge", "optifine"];

// ---------------------------------------------------------------------------
// Fabric

pub async fn fabric_loader_versions(http: &reqwest::Client, mc: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{mc}");
    let v: Value = http
        .get(&url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    e.get("loader")
                        .and_then(|l| l.get("version"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn install_fabric(
    http: &reqwest::Client,
    root: &PathBuf,
    mc: &str,
    loader: &str,
) -> Result<String, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/profile/json");
    let cached = || cached_loader_profile(root, "fabric", mc, loader);
    let fetched: Result<Value, String> = match http.get(&url).timeout(std::time::Duration::from_secs(25)).send().await {
        Ok(response) => match response.error_for_status() {
            Ok(response) => response.json().await.map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    };
    let json = match fetched {
        Ok(value) if valid_loader_profile(&value) => value,
        Ok(_) => cached().map(|(_, value)| value).ok_or("Fabric returned an incomplete launch profile".to_string())?,
        Err(error) => cached().map(|(_, value)| value).ok_or_else(|| format!("Couldn't reach Fabric metadata: {error}"))?,
    };
    let id = json
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or(&format!("fabric-loader-{loader}-{mc}"))
        .to_string();
    crate::mojang::save_version_json(root, &id, &json)?;
    Ok(id)
}

fn valid_loader_profile(value: &Value) -> bool {
    value.get("mainClass").and_then(|x| x.as_str()).map(|x| !x.is_empty()).unwrap_or(false)
        && value.get("inheritsFrom").and_then(|x| x.as_str()).map(|x| !x.is_empty()).unwrap_or(false)
        && value.get("libraries").and_then(|x| x.as_array()).is_some()
}

fn cached_loader_profile(root: &PathBuf, kind: &str, mc: &str, loader: &str) -> Option<(String, Value)> {
    let prefix = format!("{kind}-loader-");
    let entries = std::fs::read_dir(root.join("versions")).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(&prefix) || !name.contains(mc) || !name.contains(loader) {
            continue;
        }
        let path = entry.path().join(format!("{name}.json"));
        let Some(value) = std::fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str::<Value>(&raw).ok()) else {
            continue;
        };
        if valid_loader_profile(&value) {
            return Some((name, value));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Quilt

pub async fn quilt_loader_versions(http: &reqwest::Client, mc: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{mc}");
    let v: Value = http
        .get(&url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    e.get("loader")
                        .and_then(|l| l.get("version"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn install_quilt(
    http: &reqwest::Client,
    root: &PathBuf,
    mc: &str,
    loader: &str,
) -> Result<String, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{mc}/{loader}/profile/json");
    let cached = || cached_loader_profile(root, "quilt", mc, loader);
    let fetched: Result<Value, String> = match http.get(&url).timeout(std::time::Duration::from_secs(25)).send().await {
        Ok(response) => match response.error_for_status() {
            Ok(response) => response.json().await.map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    };
    let json = match fetched {
        Ok(value) if valid_loader_profile(&value) => value,
        Ok(_) => cached().map(|(_, value)| value).ok_or("Quilt returned an incomplete launch profile".to_string())?,
        Err(error) => cached().map(|(_, value)| value).ok_or_else(|| format!("Couldn't reach Quilt metadata: {error}"))?,
    };
    let id = json
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or(&format!("quilt-loader-{loader}-{mc}"))
        .to_string();
    crate::mojang::save_version_json(root, &id, &json)?;
    Ok(id)
}

// ---------------------------------------------------------------------------
// Forge

pub async fn forge_versions(http: &reqwest::Client, mc: &str) -> Result<Vec<String>, String> {
    let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let v: Value = http
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let promos = v.get("promos").and_then(|x| x.as_object()).cloned().unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    for (k, val) in promos {
        if let Some(mc_part) = k.strip_suffix("-recommended") {
            if mc_part == mc {
                push_unique(&mut out, &val);
            }
        }
        if let Some(mc_part) = k.strip_suffix("-latest") {
            if mc_part == mc {
                push_unique(&mut out, &val);
            }
        }
    }
    Ok(out)
}

fn push_unique(out: &mut Vec<String>, val: &Value) {
    if let Some(s) = val.as_str() {
        if !out.iter().any(|x| x == s) {
            out.push(s.to_string());
        }
    }
}

// ---------------------------------------------------------------------------
// NeoForge

pub async fn neoforge_versions(http: &reqwest::Client, mc: &str) -> Result<Vec<String>, String> {
    // The original NeoForge 1.20.1 line lives under the legacy forge group.
    if mc == "1.20.1" {
        let text = http
            .get("https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml")
            .timeout(std::time::Duration::from_secs(20))
            .send().await.map_err(|e| e.to_string())?
            .error_for_status().map_err(|e| e.to_string())?
            .text().await.map_err(|e| e.to_string())?;
        let mut versions: Vec<String> = text.split("<version>").skip(1)
            .filter_map(|part| part.find("</version>").map(|end| part[..end].trim().to_string()))
            .filter_map(|version| version.strip_prefix("1.20.1-").map(str::to_string))
            .collect();
        versions.reverse();
        versions.truncate(24);
        return Ok(versions);
    }
    // NeoForge version "21.1.x" targets Minecraft "1.21.1".
    let prefix = mc.trim_start_matches("1.").replace('.', ".");
    let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    let text = http
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let mut versions: Vec<String> = Vec::new();
    for part in text.split("<version>").skip(1) {
        if let Some(end) = part.find("</version>") {
            let v = part[..end].trim().to_string();
            if v.starts_with(&format!("{prefix}."))
                || v.starts_with(&format!("{prefix}-"))
            {
                versions.push(v);
            }
        }
    }
    versions.reverse(); // newest first
    // Keep enough builds for the picker to show the versions people actually
    // use. The UI already scrolls long lists, so truncating to three hid
    // popular NeoForge releases for no good reason.
    versions.truncate(24);
    Ok(versions)
}

// ---------------------------------------------------------------------------
// Forge / NeoForge install (official headless installer)

pub async fn run_loader_installer(
    java_exe: &PathBuf,
    installer_jar: &PathBuf,
    root: &PathBuf,
    log: impl Fn(String) + Send,
) -> Result<(), String> {
    ensure_launcher_profile(root)?;
    let java_exe = java_exe.clone();
    let installer_jar = installer_jar.clone();
    let root = root.clone();
    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(java_exe);
        cmd.arg("-jar").arg(installer_jar).arg("--installClient").arg(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    }).await.map_err(|e| e.to_string())?
        .map_err(|e| format!("Couldn't start the loader installer: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut lines = stdout.lines().chain(stderr.lines())
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
        .collect::<Vec<_>>();
    for line in &lines { log(line.clone()); }
    if !output.status.success() {
        let tail = lines.split_off(lines.len().saturating_sub(4)).join(" | ");
        return Err(if tail.is_empty() { "The loader installer failed".into() } else { format!("The loader installer failed: {tail}") });
    }
    Ok(())
}

fn ensure_launcher_profile(root: &PathBuf) -> Result<(), String> {
    let profile = root.join("launcher_profiles.json");
    if profile.exists() { return Ok(()); }
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let stub = serde_json::json!({ "profiles": {}, "version": 3 });
    let raw = serde_json::to_vec_pretty(&stub).map_err(|e| e.to_string())?;
    std::fs::write(profile, raw).map_err(|e| e.to_string())
}

pub async fn install_forge(
    http: &reqwest::Client,
    root: &PathBuf,
    java_exe: &PathBuf,
    mc: &str,
    forge: &str,
    log: impl Fn(String) + Send,
) -> Result<String, String> {
    // Already installed?
    if let Some(id) = find_installed_loader(root, mc, "forge", forge) {
        return Ok(id);
    }
    let version = format!("{mc}-{forge}");
    let jar_name = format!("forge-{version}-installer.jar");
    let url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{version}/{jar_name}"
    );
    let dest = root.join("cache").join(&jar_name);
    download_file(http, &url, &dest).await?;
    run_loader_installer(java_exe, &dest, root, log).await?;
    find_installed_loader(root, mc, "forge", forge)
        .ok_or_else(|| "Forge installed but its profile is missing".to_string())
}

pub async fn install_neoforge(
    http: &reqwest::Client,
    root: &PathBuf,
    java_exe: &PathBuf,
    mc: &str,
    nf: &str,
    log: impl Fn(String) + Send,
) -> Result<String, String> {
    if let Some(id) = find_installed_loader(root, mc, "neoforge", nf) {
        return Ok(id);
    }
    let (group, path_version, jar_name) = if mc == "1.20.1" {
        let version = format!("1.20.1-{nf}");
        ("net/neoforged/forge", version.clone(), format!("forge-{version}-installer.jar"))
    } else {
        ("net/neoforged/neoforge", nf.to_string(), format!("neoforge-{nf}-installer.jar"))
    };
    let url = format!("https://maven.neoforged.net/releases/{group}/{path_version}/{jar_name}");
    let dest = root.join("cache").join(&jar_name);
    download_file(http, &url, &dest).await?;
    run_loader_installer(java_exe, &dest, root, log).await?;
    find_installed_loader(root, mc, "neoforge", nf)
        .ok_or_else(|| "NeoForge installed but its profile is missing".to_string())
}

async fn download_file(http: &reqwest::Client, url: &str, dest: &PathBuf) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(p) = dest.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let bytes = tokio::time::timeout(std::time::Duration::from_secs(300), async {
        http.get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())?
            .bytes()
            .await
    })
    .await
    .map_err(|_| "download took too long (connection died?)".to_string())?
    .map_err(|e| e.to_string())?;
    std::fs::write(dest, bytes).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// OptiFine — same layout the official OptiFine installer creates for the
// vanilla launcher: the installer jar itself becomes a library,
// launchwrapper-of is extracted, and a small profile (inheritsFrom vanilla)
// adds OptiFineTweaker. The tweaker applies OptiFine's pre-baked patches at
// runtime, so no jar patching and no extra client download are needed.

const OF_MIRROR: &str = "https://bmclapi2.bangbang93.com/optifine";
const OF_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

#[derive(Clone, Debug)]
pub struct OfEntry {
    pub mc: String,
    pub ty: String,
    pub patch: String,
    pub filename: String,
}

impl OfEntry {
    pub fn label(&self) -> String {
        format!("{}_{}", self.ty, self.patch)
    }
    pub fn is_preview(&self) -> bool {
        self.filename.starts_with("preview_")
    }
    pub fn download_url(&self) -> String {
        format!("{OF_MIRROR}/{}/{}/{}", self.mc, self.ty, self.patch)
    }
}

/// The mirror's full build list, fetched ONCE per 30 minutes and shared by the
/// version picker and the installer — checking builds for another MC version
/// is instant after the first call. (The wizard used to download the whole
/// list every single time, which is what made it feel slow.)
static OF_LIST_CACHE: std::sync::OnceLock<tokio::sync::Mutex<Option<(std::time::Instant, std::sync::Arc<Vec<OfEntry>>)>>> =
    std::sync::OnceLock::new();

async fn optifine_list(http: &reqwest::Client) -> Result<std::sync::Arc<Vec<OfEntry>>, String> {
    let lock = OF_LIST_CACHE.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut guard = lock.lock().await;
    if let Some((t, cached)) = guard.as_ref() {
        if t.elapsed() < OF_CACHE_TTL {
            return Ok(cached.clone());
        }
    }
    let v: Value = http
        .get(format!("{OF_MIRROR}/versionList"))
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("Can't reach the OptiFine mirror: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    if let Some(arr) = v.as_array() {
        for e in arr {
            let mc = e.get("mcversion").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let ty = e.get("type").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let patch = e.get("patch").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let filename = e.get("filename").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if mc.is_empty() || ty.is_empty() || patch.is_empty() {
                continue;
            }
            entries.push(OfEntry { mc, ty, patch, filename });
        }
    }
    // BMCLAPI returns the list oldest-first; flip it so the newest (best)
    // builds come out on top everywhere (picker default + truncation).
    entries.reverse();
    let arc = std::sync::Arc::new(entries);
    *guard = Some((std::time::Instant::now(), arc.clone()));
    Ok(arc)
}

/// Available OptiFine builds for a Minecraft version, e.g. ["HD_U_I6", ...].
/// Newest stable builds first, previews after.
pub async fn optifine_versions(http: &reqwest::Client, mc: &str) -> Result<Vec<String>, String> {
    let entries = optifine_list(http).await?;
    let mut stable: Vec<String> = Vec::new();
    let mut preview: Vec<String> = Vec::new();
    for e in entries.iter().filter(|e| e.mc == mc) {
        let label = e.label();
        if e.is_preview() {
            preview.push(format!("{label} (preview)"));
        } else {
            stable.push(label);
        }
    }
    stable.extend(preview);
    stable.dedup();
    // Do not discard older, popular OptiFine builds. The version dropdown is
    // capped and searchable, so returning the complete matching set is both
    // faster to use and more accurate than hiding everything after 24 items.
    stable.truncate(96);
    Ok(stable)
}

/// Install OptiFine for `mc`; returns the resolved version id.
pub async fn install_optifine(
    http: &reqwest::Client,
    root: &PathBuf,
    mc: &str,
    ofver: &str,
    log: impl Fn(String) + Send,
) -> Result<String, String> {
    let ofver_clean = ofver.replace(" (preview)", "");
    let ofid = format!("{mc}-OptiFine_{ofver_clean}");

    let cached_json = root.join("versions").join(&ofid).join(format!("{ofid}.json"));
    if cached_json.exists() {
        let cached_ok = std::fs::read_to_string(&cached_json)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .and_then(|v| v.get("mainClass").and_then(|m| m.as_str()).map(|s| s.to_string()))
            .map(|m| m == "net.minecraft.launchwrapper.Launch")
            .unwrap_or(false);
        if cached_ok {
            return Ok(ofid);
        }
        // Older Orbit builds wrote a broken profile (vanilla main class — the
        // tweaker never ran). Regenerate it.
        let _ = std::fs::remove_file(&cached_json);
    }

    // find the matching build -> filename + download url (from the cached list)
    let entries = optifine_list(http).await?;
    let mut filename = format!("OptiFine_{mc}_{ofver_clean}.jar");
    let mut dl_url = String::new();
    for e in entries.iter() {
        if e.mc == mc && e.label() == ofver_clean {
            if !e.filename.is_empty() {
                filename = e.filename.clone();
            }
            dl_url = e.download_url();
            break;
        }
    }
    if dl_url.is_empty() {
        return Err("Couldn't find this OptiFine build".into());
    }

    log("Downloading OptiFine...".into());
    let installer = root.join("cache").join(&filename);
    download_file(http, &dl_url, &installer).await?;

    // the installer jar is the OptiFine library itself (official layout)
    let of_lib_path = format!("optifine/OptiFine/{mc}_{ofver_clean}/{filename}");
    let of_lib_abs = root.join("libraries").join(&of_lib_path);
    if !of_lib_abs.exists() {
        if let Some(p) = of_lib_abs.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        std::fs::copy(&installer, &of_lib_abs).map_err(|e| e.to_string())?;
    }

    // extract launchwrapper-of-x.y.jar
    let mut lw_entries: Vec<(String, String)> = Vec::new();
    {
        let file = std::fs::File::open(&installer).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let mut entry = match zip.by_index(i) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.name().to_string();
            if name.starts_with("launchwrapper-of-") && name.ends_with(".jar") {
                let lv = name
                    .trim_start_matches("launchwrapper-of-")
                    .trim_end_matches(".jar")
                    .to_string();
                let rel = format!("optifine/launchwrapper-of/{lv}/launchwrapper-of-{lv}.jar");
                let dest = root.join("libraries").join(&rel);
                if !dest.exists() {
                    if let Some(p) = dest.parent() {
                        let _ = std::fs::create_dir_all(p);
                    }
                    let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
                }
                lw_entries.push((lv, rel));
            }
        }
    }

    // small profile that inherits vanilla
    let vanilla_json = crate::mojang::version_json_by_id(http, root, mc).await?;
    let mut libraries = vec![serde_json::json!({
        "name": format!("optifine:OptiFine:{mc}_{ofver_clean}"),
        "downloads": { "artifact": { "path": of_lib_path, "url": dl_url } }
    })];
    for (lv, rel) in &lw_entries {
        libraries.push(serde_json::json!({
            "name": format!("optifine:launchwrapper-of:{lv}"),
            "downloads": { "artifact": { "path": rel, "url": dl_url } }
        }));
    }

    let is_legacy = vanilla_json.get("arguments").is_none()
        && vanilla_json.get("minecraftArguments").is_some();

    // VERIFIED against the official OptiFine installer (optifine/Installer.class):
    // the generated launcher profile ALWAYS uses launchwrapper's own main class —
    // the tweaker is a LaunchWrapper ITweaker, so with the vanilla main class it
    // would simply never run.
    let json = if is_legacy {
        let mut j = vanilla_json.clone();
        j.as_object_mut().map(|o| {
            let mut legacy = vanilla_json
                .get("minecraftArguments")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if !legacy.contains("--tweakClass") {
                legacy.push_str(" --tweakClass optifine.OptiFineTweaker");
            }
            o.insert("id".into(), Value::String(ofid.clone()));
            o.insert("mainClass".into(), Value::String("net.minecraft.launchwrapper.Launch".into()));
            o.insert("minecraftArguments".into(), Value::String(legacy));
            o.insert("libraries".into(), Value::Array(libraries));
        });
        j
    } else {
        serde_json::json!({
            "id": ofid,
            "inheritsFrom": mc,
            "type": "release",
            "mainClass": "net.minecraft.launchwrapper.Launch",
            "arguments": { "game": ["--tweakClass", "optifine.OptiFineTweaker"] },
            "libraries": libraries,
        })
    };
    crate::mojang::save_version_json(root, &ofid, &json)?;
    Ok(ofid)
}

fn find_installed_loader(root: &PathBuf, mc: &str, kind: &str, ver: &str) -> Option<String> {
    let versions_dir = root.join("versions");
    let entries = std::fs::read_dir(&versions_dir).ok()?;
    for entry in entries.flatten() {
        let folder = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().join(format!("{folder}.json"));
        let Ok(raw) = std::fs::read_to_string(&path) else { continue; };
        let Ok(profile) = serde_json::from_str::<Value>(&raw) else { continue; };
        let id = profile.get("id").and_then(|v| v.as_str()).unwrap_or(&folder).to_lowercase();
        let inherits = profile.get("inheritsFrom").and_then(|v| v.as_str()).unwrap_or("");
        if id.contains(&kind.to_lowercase()) && id.contains(&ver.to_lowercase())
            && (inherits == mc || id.starts_with(&format!("{mc}-{kind}")) || folder.to_lowercase().starts_with(&format!("{mc}-{kind}"))) {
            return Some(folder);
        }
    }
    None
}
