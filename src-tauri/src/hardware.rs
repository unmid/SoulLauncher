//! Hardware scan + FPS optimization presets.
//! Applies either JVM flags or Minecraft's own options.txt (render distance,
//! particles, vsync...) inside the Space before launch.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub cpu_cores: u32,
    pub ram_total_gb: f64,
    pub gpu_name: String,
}

/// Recommended memory (GB) for this PC: a quarter of the system RAM,
/// clamped to a sane Minecraft range.
pub fn recommended_ram(ram_total_gb: f64) -> u32 {
    ((ram_total_gb / 4.0).round() as u32).clamp(4, 12)
}

pub fn scan() -> HardwareInfo {
    let mut info = HardwareInfo {
        cpu_name: String::new(),
        cpu_cores: std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(4),
        ram_total_gb: 0.0,
        gpu_name: String::new(),
    };
    #[cfg(windows)]
    {
        // One PowerShell call — JSON with CPU / RAM / GPU.
        let script = r#"
$c = Get-CimInstance Win32_Processor | Select-Object -First 1
$m = Get-CimInstance Win32_ComputerSystem
$g = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Remote|Virtual' } | Select-Object -First 1
[pscustomobject]@{ cpu = $c.Name; cores = $c.NumberOfLogicalProcessors; ram = [math]::Round($m.TotalPhysicalMemory / 1GB, 1); gpu = $g.Name } | ConvertTo-Json -Compress
"#;
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(out) = cmd.output() {
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                if let Some(c) = v.get("cpu").and_then(|x| x.as_str()) {
                    info.cpu_name = c.trim().to_string();
                }
                if let Some(c) = v.get("cores").and_then(|x| x.as_u64()) {
                    info.cpu_cores = c as u32;
                }
                if let Some(r) = v.get("ram").and_then(|x| x.as_f64()) {
                    info.ram_total_gb = r;
                }
                if let Some(g) = v.get("gpu").and_then(|x| x.as_str()) {
                    info.gpu_name = g.trim().to_string();
                }
            }
        }
    }
    if info.ram_total_gb <= 0.0 {
        info.ram_total_gb = 8.0;
    }
    if info.cpu_name.is_empty() {
        info.cpu_name = "Unknown CPU".into();
    }
    if info.gpu_name.is_empty() {
        info.gpu_name = "Unknown GPU".into();
    }
    info
}

/// Aikar-style tuned JVM flags for Minecraft. `performance` uses the full set.
pub fn jvm_flags(mode: &str) -> String {
    let base = [
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
    ];
    let extra = [
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
    ];
    match mode {
        "performance" => base.iter().chain(extra.iter()).cloned().collect::<Vec<_>>().join(" "),
        "balanced" => base.join(" "),
        _ => String::new(),
    }
}

/// Write the optimized options.txt into the Space folder.
/// Keeps already-user-set keys we do not manage.
pub fn apply_options_txt(space_dir: &PathBuf, mode: &str, render_distance: u32) -> Result<(), String> {
    let path = space_dir.join("options.txt");
    let mut lines: Vec<(String, String)> = Vec::new();
    if let Ok(raw) = std::fs::read_to_string(&path) {
        for line in raw.lines() {
            if let Some((k, v)) = line.split_once(':') {
                lines.push((k.to_string(), v.to_string()));
            }
        }
    }
    let managed: Vec<(&str, &str)> = match mode {
        "performance" => vec![
            ("graphics", "0"),               // fast
            ("graphicsMode", "0"),           // modern Minecraft
            ("renderDistance", "8"),
            ("simulationDistance", "6"),
            ("particles", "1"),              // decreased
            ("renderClouds", "\"fast\""),
            ("cloudStatus", "\"fast\""),
            ("maxFps", "260"),
            ("framerateLimit", "260"),
            ("enableVsync", "false"),
            ("entityDistanceScaling", "0.75"),
            ("ao", "0"),                     // smooth lighting off
            ("clouds", "false"),
            ("mipmapLevels", "2"),
        ],
        "balanced" => vec![
            ("graphics", "1"),               // fancy
            ("graphicsMode", "1"),           // modern Minecraft
            ("renderDistance", "12"),
            ("simulationDistance", "8"),
            ("particles", "0"),              // all
            ("maxFps", "144"),
            ("framerateLimit", "144"),
            ("enableVsync", "false"),
            ("entityDistanceScaling", "1.0"),
            ("ao", "1"),
            ("mipmapLevels", "4"),
        ],
        _ => return Ok(()),
    };
    let rd = render_distance.to_string();
    let managed: Vec<(String, String)> = managed
        .into_iter()
        .map(|(k, v)| {
            if k == "renderDistance" && mode == "balanced" {
                (k.to_string(), rd.clone())
            } else {
                (k.to_string(), v.to_string())
            }
        })
        .collect();

    for (k, v) in &managed {
        if let Some(slot) = lines.iter_mut().find(|(lk, _)| lk == k) {
            slot.1 = v.clone();
        } else {
            lines.push((k.clone(), v.clone()));
        }
    }
    let out: String = lines
        .into_iter()
        .map(|(k, v)| format!("{k}:{v}\n"))
        .collect();
    std::fs::write(&path, out).map_err(|e| e.to_string())
}
