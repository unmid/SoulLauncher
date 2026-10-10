//! Fast parallel downloader with SHA-1 verification, dedupe and retries.

use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
    pub size: u64,
}

pub fn file_ok(path: &PathBuf, sha1: &Option<String>) -> bool {
    if !path.exists() {
        return false;
    }
    match sha1 {
        None => true,
        Some(expected) => match std::fs::read(path) {
            Ok(bytes) => {
                let mut h = Sha1::new();
                h.update(&bytes);
                hex(&h.finalize()) == expected.to_lowercase()
            }
            Err(_) => false,
        },
    }
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Download every task; existing+verified files are skipped. `progress(done, total_bytes)`
/// is called as bytes flow in.
pub async fn download_all(
    http: reqwest::Client,
    tasks: Vec<DownloadTask>,
    jobs: usize,
    progress: Arc<dyn Fn(u64, u64) + Send + Sync>,
) -> Result<(), String> {
    let tasks: Vec<DownloadTask> = tasks
        .into_iter()
        .filter(|t| !file_ok(&t.dest, &t.sha1))
        .collect();

    let total: u64 = tasks.iter().map(|t| if t.size > 0 { t.size } else { 256 * 1024 }).sum();
    let done = Arc::new(AtomicU64::new(0));
    progress(0, total);

    if tasks.is_empty() {
        progress(total, total);
        return Ok(());
    }

    let queue = Arc::new(tokio::sync::Mutex::new(tasks.into_iter()));
    let mut handles = Vec::new();
    let jobs = jobs.clamp(4, 64);

    for _ in 0..jobs {
        let http = http.clone();
        let queue = queue.clone();
        let done = done.clone();
        let progress = progress.clone();
        handles.push(tokio::spawn(async move {
            loop {
                let task = {
                    let mut q = queue.lock().await;
                    q.next()
                };
                let Some(task) = task else { break };
                download_one(&http, &task, 3, total, &done, &progress).await?;
            }
            Ok::<(), String>(())
        }));
    }

    let mut first_err: Option<String> = None;
    for h in handles {
        match h.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                if first_err.is_none() {
                    first_err = Some(e);
                }
            }
            Err(e) => {
                if first_err.is_none() {
                    first_err = Some(e.to_string());
                }
            }
        }
    }
    if let Some(e) = first_err {
        return Err(e);
    }
    progress(total, total);
    Ok(())
}

async fn download_one(
    http: &reqwest::Client,
    task: &DownloadTask,
    retries: usize,
    total: u64,
    done: &Arc<AtomicU64>,
    progress: &Arc<dyn Fn(u64, u64) + Send + Sync>,
) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 1..=retries {
        match try_download(http, task, total, done, progress).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = format!("{e} (attempt {attempt}/{retries})");
                let _ = std::fs::remove_file(&task.dest);
                let _ = std::fs::remove_file(task.dest.with_extension("part"));
                tokio::time::sleep(std::time::Duration::from_millis(400 * attempt as u64)).await;
            }
        }
    }
    Err(format!("Failed to download {}: {last_err}", task.url))
}

async fn try_download(
    http: &reqwest::Client,
    task: &DownloadTask,
    total: u64,
    done: &Arc<AtomicU64>,
    progress: &Arc<dyn Fn(u64, u64) + Send + Sync>,
) -> Result<(), String> {
    if let Some(parent) = task.dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let resp = http
        .get(&task.url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let tmp = task.dest.with_extension("part");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut hasher = task.sha1.as_ref().map(|_| Sha1::new());
    let mut stream = resp.bytes_stream();

    // A stalled connection must fail (and be retried) — never freeze the
    // launcher forever the way an unbounded `stream.next()` does.
    const STALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);
    loop {
        let next = tokio::time::timeout(STALL_TIMEOUT, stream.next()).await;
        let chunk = match next {
            Ok(Some(chunk)) => chunk.map_err(|e| e.to_string())?,
            Ok(None) => break,
            Err(_) => return Err("connection stalled (no data for 45s)".into()),
        };
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if let Some(h) = hasher.as_mut() {
            h.update(&chunk);
        }
        let n = done.fetch_add(chunk.len() as u64, Ordering::Relaxed) + chunk.len() as u64;
        progress(n.min(total), total);
    }
    drop(file);

    if let (Some(h), Some(expected)) = (hasher, &task.sha1) {
        let got = hex(&h.finalize());
        if got != expected.to_lowercase() {
            return Err(format!("corrupted file (bad checksum) for {}", task.url));
        }
    }
    std::fs::rename(&tmp, &task.dest).map_err(|e| e.to_string())?;
    Ok(())
}
