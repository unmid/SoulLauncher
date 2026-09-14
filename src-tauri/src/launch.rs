//! The launch pipeline: resolve loader -> fetch official version data -> download
//! everything in parallel -> set up Java -> build Mojang's official arguments -> play.

use crate::download::{download_all, DownloadTask};
use crate::spaces::{space_dir, Space};
use crate::store::Settings;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

pub struct ProgressSink {
    inner: Arc<dyn Fn(&str, &str, u64, u64) + Send + Sync>,
}

impl ProgressSink {
    pub fn new(f: Arc<dyn Fn(&str, &str, u64, u64) + Send + Sync>) -> Self {
        Self { inner: f }
    }
    pub fn emit(&self, stage: &str, message: &str, done: u64, total: u64) {
        (self.inner)(stage, message, done, total)
    }
}

type ProgressFn = dyn Fn(&str, &str, u64, u64) + Send + Sync;
pub type ExitFn = dyn Fn(Option<i32>) + Send + Sync;

fn throttled_progress(app_emit: Arc<ProgressFn>, stage: &'static str, message: String) -> Arc<dyn Fn(u64, u64) + Send + Sync> {
    let last = Arc::new(std::sync::Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(1)));
    Arc::new(move |done, total| {
        let mut l = last.lock().unwrap();
        if done == total || l.elapsed() > std::time::Duration::from_millis(150) {
            *l = std::time::Instant::now();
            app_emit(stage, &message, done, total);
        }
    })
}

pub struct LaunchOutcome {
    pub version_id: String,
}

pub async fn prepare_and_launch(
    http: reqwest::Client,
    root: PathBuf,
    space: &mut Space,
    settings: &Settings,
    account: &crate::accounts::Account,
    sink: ProgressSink,
    on_exit: Arc<ExitFn>,
    actually_launch: bool,
    server: Option<(String, u16)>,
) -> Result<LaunchOutcome, String> {
    let space_root = space_dir(&root, &space.id);
    let _ = std::fs::create_dir_all(&space_root);

    // optimization presets apply to the Space's own options.txt. They run
    // BEFORE category sync: preset values land first, then the category's
    // shared user settings (options.txt as the user last saved them) take
    // precedence — the shared file IS the user's truth for the group.
    if settings.optimize_mode == "balanced" || settings.optimize_mode == "performance" {
        let _ = crate::hardware::apply_options_txt(
            &space_root,
            &settings.optimize_mode,
            settings.optimize_render_distance,
        );
    }

    // -- 1. loader / version profile ----------------------------------------
    sink.emit("loader", "Getting game files ready...", 0, 0);

    let version_id: String = match space.loader.as_str() {
        "vanilla" => space.mc_version.clone(),
        "fabric" => {
            let loader_ver = match &space.loader_version {
                Some(v) => v.clone(),
                None => {
                    let list = crate::loaders::fabric_loader_versions(&http, &space.mc_version).await?;
                    list.first()
                        .cloned()
                        .ok_or("Fabric isn't available for this Minecraft version")?
                }
            };
            space.loader_version = Some(loader_ver.clone());
            crate::loaders::install_fabric(&http, &root, &space.mc_version, &loader_ver).await?
        }
        "quilt" => {
            let loader_ver = match &space.loader_version {
                Some(v) => v.clone(),
                None => {
                    let list = crate::loaders::quilt_loader_versions(&http, &space.mc_version).await?;
                    list.first()
                        .cloned()
                        .ok_or("Quilt isn't available for this Minecraft version")?
                }
            };
            space.loader_version = Some(loader_ver.clone());
            crate::loaders::install_quilt(&http, &root, &space.mc_version, &loader_ver).await?
        }
        "optifine" => {
            let loader_ver = match &space.loader_version {
                Some(v) => v.clone(),
                None => {
                    let list = crate::loaders::optifine_versions(&http, &space.mc_version).await?;
                    list.first()
                        .cloned()
                        .ok_or("OptiFine isn't available for this Minecraft version")?
                }
            };
            space.loader_version = Some(loader_ver.clone());
            let loader_ver = loader_ver;
            crate::loaders::install_optifine(
                &http,
                &root,
                &space.mc_version,
                &loader_ver,
                {
                    let sink2 = sink_clone(&sink);
                    move |line: String| sink2.emit("loader", &format!("Installing OptiFine... {line}"), 0, 0)
                },
            )
            .await?
        }
        "forge" | "neoforge" => {
            let loader_ver = space
                .loader_version
                .clone()
                .ok_or_else(|| format!("Pick a {} version first", space.loader))?;
            // need java first for the installer
            sink.emit("java", "Getting Java ready...", 0, 0);
            let base_json = crate::mojang::version_json_by_id(&http, &root, &space.mc_version).await?;
            let component = crate::mojang::java_component(&base_json);
            let java_for_install = crate::jruntime::ensure_java(
                &http,
                &root,
                &component,
                throttled_progress(sink_emit(&sink), "java", "Downloading Java...".into()),
            )
            .await
            .or_else(|_| {
                crate::jruntime::system_java_for(crate::jruntime::required_major(&component))
                    .ok_or_else(|| "Java is not installed on this PC".to_string())
            })?;
            let make_log = |kind: String| {
                let sink2 = sink_clone(&sink);
                move |line: String| {
                    sink2.emit("loader", &format!("Installing {kind}... {line}"), 0, 0);
                }
            };
            if space.loader == "forge" {
                crate::loaders::install_forge(
                    &http,
                    &root,
                    &java_for_install,
                    &space.mc_version,
                    &loader_ver,
                    make_log("Forge".to_string()),
                )
                .await?
            } else {
                crate::loaders::install_neoforge(
                    &http,
                    &root,
                    &java_for_install,
                    &space.mc_version,
                    &loader_ver,
                    make_log("NeoForge".to_string()),
                )
                .await?
            }
        }
        other => return Err(format!("Unknown software type: {other}")),
    };
    space.installed_version_id = Some(version_id.clone());

    // -- 2. version JSON (+ inherited parents) -------------------------------
    sink.emit("version", "Reading version info...", 0, 0);
    let raw_json = crate::mojang::version_json_by_id(&http, &root, &version_id).await?;
    let json = crate::mojang::resolve_inherited(&http, &root, &raw_json).await?;

    // -- 3. downloads: client + libraries + natives + assets ------------------
    let ctx = crate::mojang::HostCtx::current();
    let mut tasks: Vec<DownloadTask> = Vec::new();
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut natives: Vec<(PathBuf, Vec<String>)> = Vec::new();

    let mut client_jar: Option<PathBuf> = None;
    if let Some(client) = crate::mojang::client_download(&json) {
        let dest = root
            .join("versions")
            .join(&version_id)
            .join(format!("{version_id}.jar"));
        tasks.push(DownloadTask {
            url: client.url,
            dest: dest.clone(),
            sha1: client.sha1,
            size: client.size,
        });
        client_jar = Some(dest);
    } else {
        // loader-only profile without client jar -> use vanilla parent jar
        let parent_id = json
            .get("clientVersion")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        if let Some(pid) = parent_id {
            let dest = root.join("versions").join(&pid).join(format!("{pid}.jar"));
            if dest.exists() {
                client_jar = Some(dest);
            }
        }
    }

    // Maven paths, not filenames, identify libraries. Different artifacts can share a name.
    let mut seen_paths = std::collections::HashSet::new();
    for lib in crate::mojang::collect_libraries(&json, &ctx) {
        if let Some(a) = &lib.artifact {
            if seen_paths.insert(a.path.to_lowercase()) {
                let dest = root.join("libraries").join(&a.path);
                tasks.push(DownloadTask {
                    url: a.url.clone(),
                    dest: dest.clone(),
                    sha1: a.sha1.clone(),
                    size: a.size,
                });
                classpath.push(dest);
            }
        }
        if let Some(n) = &lib.natives {
            let dest = root
                .join("libraries")
                .join(&n.path);
            tasks.push(DownloadTask {
                url: n.url.clone(),
                dest: dest.clone(),
                sha1: n.sha1.clone(),
                size: n.size,
            });
            natives.push((dest, lib.extract_exclude.clone()));
        }
    }
    // Mojang's launcher puts the client jar after all libraries.
    if let Some(client_jar) = client_jar {
        classpath.push(client_jar);
    }

    // assets (download the index first if it's not on disk yet)
    let assets_root = root.join("assets");
    let assets_index_name;
    if let Some((index_id, index_url, index_sha1, index_size)) =
        crate::mojang::asset_index_info(&json)
    {
        let index_path = assets_root
            .join("indexes")
            .join(format!("{index_id}.json"));
        if !crate::download::file_ok(&index_path, &index_sha1) {
            sink.emit("files", "Downloading assets list...", 0, 0);
            download_all(
                http.clone(),
                vec![DownloadTask {
                    url: index_url,
                    dest: index_path.clone(),
                    sha1: index_sha1,
                    size: index_size,
                }],
                2,
                Arc::new(|_, _| {}),
            )
            .await?;
        }
        let idx: serde_json::Value = std::fs::read_to_string(&index_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .ok_or("Couldn't read the assets list")?;
        collect_asset_tasks(&idx, &root, &mut tasks);
        assets_index_name = index_id;
    } else {
        assets_index_name = crate::mojang::asset_index_fallback_id(&json);
    }

    // -- 4. download everything ----------------------------------------------
    let sink_arc = Arc::new(sink);
    let stage_files = throttled_progress(sink_emit(&sink_arc), "files", "Downloading game files...".into());
    download_all(http.clone(), tasks, 32, stage_files).await?;

    // -- 5. java ---------------------------------------------------------------
    let component = crate::mojang::java_component(&json);
    let java_path = match crate::jruntime::ensure_java(
        &http,
        &root,
        &component,
        throttled_progress(sink_emit(&sink_arc), "java", "Downloading Java...".into()),
    )
    .await
    {
        Ok(p) => p,
        Err(_) => crate::jruntime::system_java_for(crate::jruntime::required_major(&component))
            .ok_or("Java is not installed. The launcher tried to fetch it automatically but failed")?,
    };

    // -- 6. extract natives ---------------------------------------------------
    let natives_dir = space_root.join("natives");
    let _ = std::fs::create_dir_all(&natives_dir);
    for (jar, exclude) in &natives {
        extract_natives(jar, &natives_dir, exclude).await?;
    }

    // -- 7. arguments -----------------------------------------------------------
    sink_emit(&sink_arc)("launching", "Starting the game...", 0, 0);

    let mut vars: HashMap<String, String> = HashMap::new();
    vars.insert("auth_player_name".into(), account.username.clone());
    vars.insert(
        "auth_uuid".into(),
        account.uuid.replace('-', ""),
    );
    vars.insert(
        "auth_access_token".into(),
        account
            .access_token
            .clone()
            .unwrap_or_else(|| "0".to_string()),
    );
    vars.insert("auth_xuid".into(), account.xuid.clone().unwrap_or_default());
    vars.insert("clientid".into(), "0".to_string());
    vars.insert("user_type".into(), "msa".to_string());
    vars.insert("version_name".into(), version_id.clone());
    vars.insert("version_type".into(), "release".to_string());
    vars.insert("game_directory".into(), space_root.to_string_lossy().to_string());
    vars.insert("assets_root".into(), assets_root.to_string_lossy().to_string());
    vars.insert("assets_index_name".into(), assets_index_name);
    vars.insert("natives_directory".into(), natives_dir.to_string_lossy().to_string());
    vars.insert("launcher_name".into(), "soul-launcher".to_string());
    vars.insert("launcher_version".into(), "beta".to_string());
    vars.insert("library_directory".into(), root.join("libraries").to_string_lossy().to_string());
    vars.insert("resolution_width".into(), "854".to_string());
    vars.insert("resolution_height".into(), "480".to_string());
    let separator = if cfg!(windows) { ";" } else { ":" };
    let classpath_str = classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator);
    vars.insert("classpath_separator".into(), separator.to_string());
    vars.insert("classpath".into(), classpath_str);

    let ram = space.ram_gb.unwrap_or(settings.ram_gb).max(1);

    // optimization mode adds tuned JVM flags unless the user wrote their own
    let mut extra_jvm = settings.extra_jvm_args.trim().to_string();
    if extra_jvm.is_empty() && (settings.optimize_auto || settings.optimize_mode != "off") {
        extra_jvm = crate::hardware::jvm_flags(&settings.optimize_mode);
    }

    let mut args = crate::mojang::build_launch_args(&json, &ctx, &vars, ram, &extra_jvm)?;

    // direct server join
    if let Some((host, port)) = &server {
        sink_emit(&sink_arc)("launching", &format!("Opening {host}..."), 0, 0);
        args.game.push("--server".into());
        args.game.push(host.clone());
        args.game.push("--port".into());
        args.game.push(port.to_string());
    }

    // Category sync happens last, right before the process spawns: the
    // shared options.txt / servers.dat of the Space's category overwrite
    // the local copies so every member boots with the same settings. The
    // optimize presets above run first — shared user settings win, because
    // whatever the category says IS the user's latest choice.
    if let Err(e) = crate::categories::push_shared_into_space(&root, space) {
        sink_emit(&sink_arc)("loader", &format!("Category settings skipped: {e}"), 0, 0);
    }

    if actually_launch {
        run_java(&java_path, &args, &space_root, sink_emit(&sink_arc), on_exit).await?;
    } else {
        sink_emit(&sink_arc)("done", "Everything is ready to play!", 0, 0);
        println!("\n=== FINAL LAUNCH COMMAND ===");
        println!("{}", java_path.display());
        for a in args.jvm.iter().chain(std::iter::once(&args.main_class)).chain(args.game.iter()) {
            println!("  {a}");
        }
    }

    Ok(LaunchOutcome { version_id })
}

fn sink_emit(sink: &ProgressSink) -> Arc<ProgressFn> {
    let inner = sink.inner.clone();
    inner
}

fn sink_clone(sink: &ProgressSink) -> ProgressSink {
    ProgressSink { inner: sink.inner.clone() }
}

fn collect_asset_tasks(idx: &serde_json::Value, root: &PathBuf, tasks: &mut Vec<DownloadTask>) {
    let objects = match idx.get("objects").and_then(|x| x.as_object()) {
        Some(o) => o,
        None => return,
    };
    for (_name, info) in objects {
        let hash = info.get("hash").and_then(|x| x.as_str()).unwrap_or("");
        let size = info.get("size").and_then(|x| x.as_u64()).unwrap_or(0);
        if hash.len() < 2 {
            continue;
        }
        let (pre, _) = hash.split_at(2);
        tasks.push(DownloadTask {
            url: format!("{}/{pre}/{hash}", crate::mojang::RESOURCES_BASE),
            dest: root
                .join("assets")
                .join("objects")
                .join(pre)
                .join(hash),
            sha1: Some(hash.to_string()),
            size,
        });
    }
}

async fn extract_natives(
    jar: &PathBuf,
    dest: &PathBuf,
    exclude: &[String],
) -> Result<(), String> {
    if !jar.exists() {
        return Ok(());
    }
    let jar = jar.clone();
    let dest = dest.clone();
    let exclude: Vec<String> = exclude.to_vec();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::open(&jar).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = match archive.by_index(i) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.name().to_string();
            if entry.is_dir() {
                continue;
            }
            if exclude.iter().any(|ex| name.starts_with(ex)) || name.starts_with("META-INF") {
                continue;
            }
            let out_path = dest.join(&name);
            if let Some(parent) = out_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if !out_path.exists() {
                let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

async fn run_java(
    java: &PathBuf,
    args: &crate::mojang::LaunchArgs,
    cwd: &PathBuf,
    emit: Arc<ProgressFn>,
    on_exit: Arc<ExitFn>,
) -> Result<(), String> {
    emit("launching", "Launching Minecraft...", 0, 0);

    let mut cmd = std::process::Command::new(java);
    cmd.current_dir(cwd);
    cmd.args(&args.jvm);
    cmd.arg(&args.main_class);
    cmd.args(&args.game);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    // Capture the game's own log and stream it into Orbit's terminal view.
    let log_path = cwd.join("soul-game.log");
    let _ = std::fs::File::create(&log_path);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Couldn't start Minecraft: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let path = log_path.clone();
        let emit2 = emit.clone();
        std::thread::spawn(move || read_game_stream(stdout, "stdout", path, emit2));
    }
    if let Some(stderr) = child.stderr.take() {
        let path = log_path.clone();
        let emit2 = emit.clone();
        std::thread::spawn(move || read_game_stream(stderr, "stderr", path, emit2));
    }

    emit("running", "Playing", 0, 0);

    // Watch it in the background - the launcher stays responsive and
    // the Space unlocks when the game closes.
    tokio::task::spawn_blocking(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        on_exit(code);
    });
    Ok(())
}

fn read_game_stream<R: std::io::Read + Send + 'static>(reader: R, stream: &'static str, path: PathBuf, emit: Arc<ProgressFn>) {
    use std::io::{BufRead, BufReader, Write};
    let mut input = BufReader::new(reader);
    let mut line = String::new();
    loop {
        line.clear();
        match input.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let text = line.trim_end_matches(['\r', '\n']).to_string();
                if text.is_empty() {
                    continue;
                }
                if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
                    let _ = writeln!(file, "[{stream}] {text}");
                }
                // The app logger records this event while the React shell
                // ignores the synthetic progress stage named `log`.
                emit("log", &format!("{stream}: {text}"), 0, 0);
            }
            Err(_) => break,
        }
    }
}
