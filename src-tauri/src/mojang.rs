//! Mojang version manifest + version profile handling.
//!
//! The launch arguments are taken **verbatim from the official Mojang version JSON**
//! (the same data the official Minecraft Launcher downloads from Mojang's servers).
//! We never hardcode JVM flags - we evaluate Mojang's own `arguments`/`rules` blocks,
//! so every Minecraft version (old `minecraftArguments` string format and the modern
//! `arguments` format) launches exactly the way Mojang intended.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

pub const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const RESOURCES_BASE: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub release_time: String,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct Artifact {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct LibraryEntry {
    #[allow(dead_code)] // mirrors the Mojang library JSON
    pub name: String,
    pub artifact: Option<Artifact>,
    pub natives: Option<Artifact>,
    pub extract_exclude: Vec<String>,
}

pub struct HostCtx {
    pub is_windows: bool,
    pub is_x86_64: bool,
}

impl HostCtx {
    pub fn current() -> Self {
        Self {
            is_windows: cfg!(windows),
            is_x86_64: cfg!(target_arch = "x86_64"),
        }
    }
}

// ---------------------------------------------------------------------------
// Manifest / version JSON fetching

pub async fn fetch_manifest(http: &reqwest::Client) -> Result<Vec<VersionSummary>, String> {
    let v: Value = http
        .get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Can't reach Mojang servers: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    if let Some(items) = v.get("versions").and_then(|x| x.as_array()) {
        for it in items {
            let summary = VersionSummary {
                id: it.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                kind: it
                    .get("type")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                release_time: it
                    .get("releaseTime")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: it.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            };
            if !summary.id.is_empty() && !summary.url.is_empty() {
                out.push(summary);
            }
        }
    }
    Ok(out)
}

pub async fn fetch_json_url(http: &reqwest::Client, url: &str) -> Result<Value, String> {
    http.get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Get a version JSON by id - from disk cache, or by downloading from Mojang.
pub async fn version_json_by_id(
    http: &reqwest::Client,
    root: &PathBuf,
    id: &str,
) -> Result<Value, String> {
    let path = root.join("versions").join(id).join(format!("{id}.json"));
    if path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str(&raw) {
                return Ok(v);
            }
        }
    }
    let manifest = fetch_manifest(http).await?;
    let entry = manifest
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| format!("Version {id} was not found on Mojang's servers"))?;
    let json = fetch_json_url(http, &entry.url).await?;
    crate::store::save_json(&path, &json)?;
    Ok(json)
}

pub fn save_version_json(root: &PathBuf, id: &str, json: &Value) -> Result<(), String> {
    crate::store::save_json(
        &root.join("versions").join(id).join(format!("{id}.json")),
        json,
    )
}

/// Recursively merge `inheritsFrom` parents (Fabric/Forge/Quilt profiles).
/// Child wins; `arguments` and `libraries` are concatenated child-first.
pub async fn resolve_inherited(
    http: &reqwest::Client,
    root: &PathBuf,
    json: &Value,
) -> Result<Value, String> {
    let mut merged = json.clone();
    let mut guard = 0;
    while let Some(parent_id) = merged
        .get("inheritsFrom")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
    {
        guard += 1;
        if guard > 8 {
            return Err("Too many nested version inherits".into());
        }
        let parent_raw = version_json_by_id(http, root, &parent_id).await?;
        merged = merge_version_json(&parent_raw, &merged);
        // re-resolve so a parent chain fully flattens
        let mut m2 = merged.clone();
        if let Some(obj) = m2.as_object_mut() {
            obj.remove("inheritsFrom");
        }
        merged = m2;
    }
    Ok(merged)
}

fn merge_version_json(parent: &Value, child: &Value) -> Value {
    let mut result = parent.clone();
    let result_obj = match result.as_object_mut() {
        Some(o) => o,
        None => return result,
    };
    let child_obj = match child.as_object() {
        Some(o) => o,
        None => return result,
    };

    for (key, value) in child_obj {
        match key.as_str() {
            "libraries" => {
                let mut merged = value.as_array().cloned().unwrap_or_default();
                if let Some(parent_libs) = result_obj.get("libraries").and_then(|x| x.as_array()) {
                    merged.extend(parent_libs.iter().cloned());
                }
                result_obj.insert("libraries".into(), Value::Array(merged));
            }
            "arguments" => {
                let mut out = serde_json::Map::new();
                for part in ["game", "jvm"] {
                    let mut merged: Vec<Value> = child
                        .get("arguments")
                        .and_then(|a| a.get(part))
                        .and_then(|x| x.as_array())
                        .cloned()
                        .unwrap_or_default();
                    if let Some(parent_args) = result_obj
                        .get("arguments")
                        .and_then(|a| a.get(part))
                        .and_then(|x| x.as_array())
                    {
                        merged.extend(parent_args.iter().cloned());
                    }
                    out.insert(part.into(), Value::Array(merged));
                }
                result_obj.insert("arguments".into(), Value::Object(out));
            }
            "id" | "mainClass" | "type" | "time" | "releaseTime" => {
                result_obj.insert(key.clone(), value.clone());
            }
            // things that must come from the parent (vanilla) if child doesn't set them
            _ => {
                result_obj.insert(key.clone(), value.clone());
            }
        }
    }
    // restore parent-only fields the child never defines (assets, downloads, javaVersion...)
    result
}

// ---------------------------------------------------------------------------
// Rules (the official format used by Mojang)

fn os_matches(os: &Value, ctx: &HostCtx) -> bool {
    if let Some(name) = os.get("name").and_then(|x| x.as_str()) {
        let ok = match name {
            "windows" => ctx.is_windows,
            "osx" => cfg!(target_os = "macos"),
            "linux" => cfg!(target_os = "linux"),
            _ => false,
        };
        if !ok {
            return false;
        }
    }
    if let Some(arch) = os.get("arch").and_then(|x| x.as_str()) {
        let ok = match arch {
            "x86" => !ctx.is_x86_64 && cfg!(target_arch = "x86"),
            "amd64" | "x86_64" => ctx.is_x86_64,
            "arm64" | "aarch64" => cfg!(target_arch = "aarch64"),
            "arm" => cfg!(target_arch = "arm"),
            _ => false,
        };
        if !ok {
            return false;
        }
    }
    // os.version (e.g. "^10\\.") - we assume a modern Windows, treat as matched.
    true
}

/// Official rule evaluation: a rule list starts disallowed; matching rules flip
/// the flag to their action. We don't enable any "features" (demo, custom res).
pub fn element_allowed(rules: Option<&Value>, ctx: &HostCtx) -> bool {
    let rules = match rules.and_then(|r| r.as_array()) {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };
    let mut allowed = false;
    for rule in rules {
        let mut matches = true;
        if let Some(os) = rule.get("os") {
            if !os_matches(os, ctx) {
                matches = false;
            }
        }
        if rule.get("features").is_some() {
            // Features (demo mode etc.) are never enabled by us.
            matches = false;
        }
        if matches {
            allowed = rule
                .get("action")
                .and_then(|a| a.as_str())
                .map(|a| a == "allow")
                .unwrap_or(true);
        }
    }
    allowed
}

// ---------------------------------------------------------------------------
// Placeholder substitution - same variables the official launcher fills in.

pub fn substitute(input: &str, vars: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find('}') {
            Some(end) => {
                let key = &after[..end];
                out.push_str(vars.get(key).map(|s| s.as_str()).unwrap_or(after[..0].as_ref()));
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Split the legacy `minecraftArguments` string (respects quoted segments).
pub fn split_legacy_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in input.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
        } else if ch.is_whitespace() && !in_quotes {
            if !cur.is_empty() {
                args.push(std::mem::take(&mut cur));
            }
        } else {
            cur.push(ch);
        }
    }
    if !cur.is_empty() {
        args.push(cur);
    }
    args
}

/// Expand an `arguments` array (string | {rules, value}) into plain strings.
fn expand_args_array(items: &Value, ctx: &HostCtx, vars: &HashMap<String, String>) -> Vec<String> {
    let mut out = Vec::new();
    let arr = match items.as_array() {
        Some(a) => a,
        None => return out,
    };
    for item in arr {
        match item {
            Value::String(s) => out.push(substitute(s, vars)),
            Value::Object(_) => {
                if !element_allowed(item.get("rules"), ctx) {
                    continue;
                }
                match item.get("value") {
                    Some(Value::String(s)) => out.push(substitute(s, vars)),
                    Some(Value::Array(list)) => {
                        for v in list {
                            if let Some(s) = v.as_str() {
                                out.push(substitute(s, vars));
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
    out
}

pub struct LaunchArgs {
    pub jvm: Vec<String>,
    pub game: Vec<String>,
    pub main_class: String,
}

/// Build the exact JVM + game arguments Mojang defines for this version.
pub fn build_launch_args(
    json: &Value,
    ctx: &HostCtx,
    vars: &HashMap<String, String>,
    ram_gb: u32,
    extra_jvm: &str,
) -> Result<LaunchArgs, String> {
    let main_class = json
        .get("mainClass")
        .and_then(|x| x.as_str())
        .ok_or("This version has no main class")?
        .to_string();

    let mut jvm: Vec<String>;
    let mut game: Vec<String>;

    if let Some(arguments) = json.get("arguments") {
        // Modern format (1.13+)
        jvm = expand_args_array(arguments.get("jvm").unwrap_or(&Value::Null), ctx, vars);
        game = expand_args_array(arguments.get("game").unwrap_or(&Value::Null), ctx, vars);
    } else if let Some(legacy) = json.get("minecraftArguments").and_then(|x| x.as_str()) {
        // Legacy format (<= 1.12.2)
        jvm = vec![
            "-Djava.library.path=${natives_directory}".to_string(),
            "-cp".to_string(),
            "${classpath}".to_string(),
        ]
        .into_iter()
        .map(|s| substitute(&s, vars))
        .collect();
        game = split_legacy_args(legacy)
            .into_iter()
            .map(|s| substitute(&s, vars))
            .collect();
        // Legacy tweakers (Forge) may add JVM bits via "+tweakers"
        if let Some(tweakers) = json.get("+tweakers").and_then(|x| x.as_array()) {
            for t in tweakers {
                if let Some(t) = t.as_str() {
                    game.push("--tweakClass".into());
                    game.push(t.to_string());
                }
            }
        }
    } else {
        return Err("This version does not define launch arguments".into());
    }

    // RAM: remove Mojang's default memory flags, apply the user's choice.
    jvm.retain(|a| !a.starts_with("-Xmx") && !a.starts_with("-Xms"));
    let mut final_jvm = vec![format!("-Xmx{}G", ram_gb), format!("-Xms{}G", ram_gb.min(1).max(1))];
    final_jvm.extend(jvm);
    for extra in extra_jvm.split_whitespace() {
        if !extra.is_empty() {
            final_jvm.push(extra.to_string());
        }
    }

    Ok(LaunchArgs {
        jvm: final_jvm,
        game,
        main_class,
    })
}

// ---------------------------------------------------------------------------
// Library / natives / asset parsing

fn parse_artifact(dl: &Value, is_native: bool) -> Option<Artifact> {
    let _ = is_native;
    // note: the client download has no "path" (only libraries/natives do)
    let path = dl
        .get("path")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let url = dl.get("url").and_then(|x| x.as_str())?.to_string();
    Some(Artifact {
        path,
        url,
        sha1: dl.get("sha1").and_then(|x| x.as_str()).map(|s| s.to_string()),
        size: dl.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
    })
}

/// Maven-style path for libraries that only carry `name`+`url` (Fabric/Forge).
pub fn maven_path(name: &str) -> Option<String> {
    let name = name.split('@').next().unwrap_or(name);
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 {
        format!("-{}", parts[3])
    } else {
        String::new()
    };
    Some(format!(
        "{group}/{artifact}/{version}/{artifact}-{version}{classifier}.jar"
    ))
}

pub fn collect_libraries(json: &Value, ctx: &HostCtx) -> Vec<LibraryEntry> {
    let mut out = Vec::new();
    let libs = match json.get("libraries").and_then(|x| x.as_array()) {
        Some(l) => l,
        None => return out,
    };
    for lib in libs {
        if !element_allowed(lib.get("rules"), ctx) {
            continue;
        }
        let name = lib
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let downloads = lib.get("downloads").cloned().unwrap_or(Value::Null);

        let artifact = downloads.get("artifact").and_then(|a| parse_artifact(a, false));

        // Natives: pick the best windows classifier with ${arch} substitution.
        let mut natives: Option<Artifact> = None;
        if let Some(classifiers) = downloads.get("classifiers").and_then(|c| c.as_object()) {
            let arch_word = if ctx.is_x86_64 { "64" } else { "86" };
            let mut best: Option<Artifact> = None;
            for (key, dl) in classifiers {
                let k = key.replace("${arch}", arch_word);
                let parsed = match parse_artifact(dl, true) {
                    Some(p) => p,
                    None => continue,
                };
                if ctx.is_windows {
                    let exact = k == "natives-windows";
                    let compat = k.contains("windows")
                        && (k.contains("x86_64") || k.contains("64"))
                        && !k.contains("arm64");
                    if exact {
                        best = Some(parsed);
                        break;
                    } else if compat && best.is_none() {
                        best = Some(parsed);
                    }
                } else if cfg!(target_os = "macos") && k.contains("osx") && !k.contains("arm64") {
                    best = Some(parsed);
                } else if cfg!(target_os = "linux") && k.contains("linux") {
                    best = Some(parsed);
                }
            }
            natives = best;
        }

        // No declared artifact: build from maven coordinates (mod loaders).
        // Only when the library has no natives part - natives-only libraries
        // (legacy lwjgl/jinput) have no plain jar and would 404 otherwise.
        let artifact = artifact.or_else(|| {
            if natives.is_some() {
                return None;
            }
            let base = lib
                .get("url")
                .and_then(|x| x.as_str())
                .unwrap_or("https://libraries.minecraft.net/");
            maven_path(&name).map(|p| Artifact {
                url: format!("{}{}", base.trim_end_matches('/'), "/".to_owned() + &p),
                path: p,
                sha1: None,
                size: 0,
            })
        });

        // skip natives-only libraries with no usable artifact for us
        if artifact.is_none() && natives.is_none() {
            continue;
        }
        let extract_exclude = lib
            .get("extract")
            .and_then(|e| e.get("exclude"))
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if artifact.is_some() || natives.is_some() {
            out.push(LibraryEntry {
                name,
                artifact,
                natives,
                extract_exclude,
            });
        }
    }
    out
}

pub fn asset_index_info(json: &Value) -> Option<(String, String, Option<String>, u64)> {
    let ai = json.get("assetIndex")?;
    Some((
        ai.get("id")
            .and_then(|x| x.as_str())
            .or_else(|| json.get("assets").and_then(|x| x.as_str()))
            .unwrap_or("legacy")
            .to_string(),
        ai.get("url")?.as_str()?.to_string(),
        ai.get("sha1").and_then(|x| x.as_str()).map(|s| s.to_string()),
        ai.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
    ))
}

pub fn asset_index_fallback_id(json: &Value) -> String {
    json.get("assets")
        .and_then(|x| x.as_str())
        .unwrap_or("legacy")
        .to_string()
}

pub fn client_download(json: &Value) -> Option<Artifact> {
    parse_artifact(json.get("downloads")?.get("client")?, false)
}

pub fn java_component(json: &Value) -> String {
    json.get("javaVersion")
        .and_then(|j| j.get("component"))
        .and_then(|x| x.as_str())
        .unwrap_or("jre-legacy")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    fn vars() -> HashMap<String, String> {
        let mut v = HashMap::new();
        v.insert("natives_directory".into(), "NAT".into());
        v.insert("classpath".into(), "CP".into());
        v.insert("classpath_separator".into(), ";".into());
        v.insert("auth_player_name".into(), "Alex".into());
        v.insert("version_name".into(), "1.21.1".into());
        v.insert("game_directory".into(), "GD".into());
        v.insert("assets_root".into(), "AR".into());
        v.insert("assets_index_name".into(), "16".into());
        v.insert("auth_uuid".into(), "uuid".into());
        v.insert("auth_access_token".into(), "tok".into());
        v.insert("clientid".into(), "0".into());
        v.insert("auth_xuid".into(), "".into());
        v.insert("user_type".into(), "msa".into());
        v.insert("version_type".into(), "release".into());
        v.insert("launcher_name".into(), "soul-launcher".into());
        v.insert("launcher_version".into(), "beta".into());
        v
    }

    // mirror of what Mojang actually ships for modern versions (1.21.x style)
    fn modern_json() -> Value {
        json!({
            "mainClass": "net.minecraft.client.main.Main",
            "javaVersion": {"component": "java-runtime-delta", "majorVersion": 21},
            "assetIndex": {"id": "16", "url": "https://piston-meta.mojang.com/x.json", "sha1": "abc", "size": 10},
            "downloads": {"client": {"path":null,"url": "https://x/client.jar", "sha1": "abc", "size": 1}},
            "arguments": {
                "game": ["--username", "${auth_player_name}", "--version", "${version_name}", "--gameDir", "${game_directory}", "--assetsDir", "${assets_root}", "--assetIndex", "${assets_index_name}", "--uuid", "${auth_uuid}", "--accessToken", "${auth_access_token}", {"rules": [{"action": "allow", "features": {"is_demo_user": true}}], "value": "--demo"}, "--width", "854"],
                "jvm": [
                    {"rules": [{"action": "allow", "os": {"name": "osx"}}], "value": ["-XstartOnFirstThread"]},
                    {"rules": [{"action": "allow", "os": {"name": "windows"}}], "value": "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump"},
                    {"rules": [{"action": "allow", "os": {"name": "windows", "arch": "x86"}}], "value": "-Xss1M"},
                    "-Djava.library.path=${natives_directory}",
                    "-Djna.tmpdir=${natives_directory}",
                    "-cp", "${classpath}",
                    "-Xmx2G", "-XX:+UnlockExperimentalVMOptions"
                ]
            }
        })
    }

    #[test]
    fn modern_args_official_and_ram_replaced() {
        let ctx = HostCtx { is_windows: true, is_x86_64: true };
        let args = build_launch_args(&modern_json(), &ctx, &vars(), 8, "").unwrap();
        assert_eq!(args.main_class, "net.minecraft.client.main.Main");
        assert!(args.jvm.iter().any(|a| a == "-Xmx8G"), "custom ram applied");
        assert!(!args.jvm.iter().any(|a| a == "-Xmx2G"), "mojang default removed");
        assert!(!args.jvm.iter().any(|a| a == "-XstartOnFirstThread"), "osx-only dropped");
        assert!(!args.jvm.iter().any(|a| a == "-Xss1M"), "x86-only dropped on x64");
        assert!(args.jvm.contains(&"-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump".to_string()));
        assert!(args.jvm.contains(&"-Djava.library.path=NAT".to_string()));
        assert!(args.jvm.contains(&"CP".into()));
        assert!(!args.game.iter().any(|a| a == "--demo"), "feature-gated arg dropped");
        assert!(args.game.contains(&"Alex".into()));
        assert!(args.game.contains(&"854".into()));
    }

    #[test]
    fn legacy_string_args_work() {
        let ctx = HostCtx { is_windows: true, is_x86_64: true };
        let json = json!({
            "mainClass": "net.minecraft.client.main.Main",
            "minecraftArguments": "--username ${auth_player_name} --version ${version_name} --gameDir \"${game_directory}\" --assetsDir ${assets_root} --assetIndex ${assets_index_name}",
            "assets": "legacy"
        });
        let args = build_launch_args(&json, &ctx, &vars(), 4, "").unwrap();
        assert!(args.game.contains(&"Alex".into()));
        assert!(args.game.contains(&"GD".into()), "quoted placeholder kept whole");
        assert!(args.game.contains(&"16".into()));
        assert_eq!(args.jvm.last().unwrap(), "CP");
        assert!(args.jvm.contains(&"-Xmx4G".into()));
    }

    #[test]
    fn merge_inherits_child_first() {
        let parent = json!({"mainClass":"base.Main","libraries":[{"name":"a:b:1"}],"arguments":{"jvm":["-Da=1"],"game":["--base"]},"downloads":{"client":{"url":"x"}}});
        let child = json!({"inheritsFrom":"1.21.1","mainClass":"fabric.Main","libraries":[{"name":"f:g:2"}],"arguments":{"jvm":["-Df=1"],"game":["--f"]}});
        let rt = tokio::runtime::Runtime::new().unwrap();
        let merged = rt.block_on(async { merge_version_json(&parent, &child) });
        assert_eq!(merged.get("mainClass").unwrap(), "fabric.Main");
        let libs = merged.get("libraries").unwrap().as_array().unwrap();
        assert_eq!(libs.len(), 2);
        assert_eq!(libs[0].get("name").unwrap(), "f:g:2"); // child first
        let jvm = merged.get("arguments").unwrap().get("jvm").unwrap().as_array().unwrap();
        assert_eq!(jvm[0], "-Df=1");
        assert!(merged.get("downloads").is_some(), "parent data kept");
    }

    #[test]
    fn maven_paths() {
        assert_eq!(maven_path("com.google.guava:guava:21.0").unwrap(), "com/google/guava/guava/21.0/guava-21.0.jar");
        assert_eq!(maven_path("org.lwjgl:lwjgl:3.3.1:natives-windows").unwrap(), "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar");
        assert!(maven_path("broken").is_none());
    }
}
