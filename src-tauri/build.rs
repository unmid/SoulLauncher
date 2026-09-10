// Build script: reads local secrets.env (gitignored) and exposes values as
// compile-time env vars. Never fails when the file is absent, so public clones
// still build (features that need secrets degrade gracefully).
fn main() {
    for key in ["SOUL_TOKEN", "SOUL_CF_KEY"] {
        if let Ok(v) = std::env::var(key) {
            println!("cargo:rustc-env={key}={v}");
        }
    }
    if let Ok(raw) = std::fs::read_to_string("secrets.env") {
        for line in raw.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                println!("cargo:rustc-env={}={}", k.trim(), v.trim());
            }
        }
        println!("cargo:rerun-if-changed=secrets.env");
    }
    tauri_build::build()
}
