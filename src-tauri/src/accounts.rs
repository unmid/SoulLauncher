//! Accounts: Microsoft (via the launcher's auth API) + offline profiles.
//! Refresh tokens live in the Windows Credential Manager via keyring.

use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use uuid::Uuid;

const AUTH_API_BASE: &str = "https://openlauncher.api.codevbox.com";
const AUTH_KEYCHAIN_SERVICE: &str = "SoulLauncher";
/// Older builds stored Microsoft refresh tokens under the Orbit service name.
/// New sign-ins use Soul; old credentials keep working through the fallback.
const LEGACY_AUTH_KEYCHAIN_SERVICE: &str = "OrbitLauncher";

// Dev build identity shipped with the open-source launcher.
const DEV_BUILD_ID: &str = "20260601_010619";
const DEV_BUILD_SIGNATURE: &str = "8e024ebcb9e2c011141c09228260c9fd81932717af80003ca446ca6df2e49c9a";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub username: String,
    pub uuid: String,
    /// microsoft | offline
    pub kind: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub xuid: Option<String>,
}

fn accounts_path(root: &PathBuf) -> PathBuf {
    root.join("accounts.json")
}

pub fn load_accounts(root: &PathBuf) -> Vec<Account> {
    crate::store::load_json(&accounts_path(root)).unwrap_or_default()
}

pub fn save_accounts(root: &PathBuf, accounts: &[Account]) -> Result<(), String> {
    crate::store::save_json(&accounts_path(root), &accounts)
}

// ---------------------------------------------------------------------------
// Offline accounts

/// Java's UUID.nameUUIDFromBytes("OfflinePlayer:"+name) (MD5, version 3).
pub fn offline_uuid(name: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{name}").as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();
    bytes[6] = bytes[6] & 0x0f | 0x30;
    bytes[8] = bytes[8] & 0x3f | 0x80;
    let h = crate::download::hex(&bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

pub fn create_offline_account(root: &PathBuf, name: &str) -> Result<Account, String> {
    let name = name.trim();
    if name.len() < 3 || name.len() > 16 {
        return Err("Name must be between 3 and 16 characters".into());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Only letters, numbers and _ are allowed".into());
    }
    let account = Account {
        id: Uuid::new_v4().to_string(),
        username: name.to_string(),
        uuid: offline_uuid(name),
        kind: "offline".into(),
        access_token: None,
        xuid: None,
    };
    let mut accounts = load_accounts(root);
    accounts.push(account.clone());
    save_accounts(root, &accounts)?;
    Ok(account)
}

// ---------------------------------------------------------------------------
// Microsoft accounts

fn auth_headers() -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    h.insert("x-launcher-id", DEV_BUILD_ID.parse().unwrap());
    h.insert("x-launcher-sign", DEV_BUILD_SIGNATURE.parse().unwrap());
    h.insert("content-type", "application/json".parse().unwrap());
    h
}

fn api_account_to_account(v: &Value) -> Result<Account, String> {
    let username = v
        .get("name")
        .or_else(|| v.get("username"))
        .and_then(|x| x.as_str())
        .ok_or("Auth service returned no username")?
        .to_string();
    let uuid = v
        .get("uuid")
        .or_else(|| v.get("id"))
        .and_then(|x| x.as_str())
        .ok_or("Auth service returned no uuid")?
        .to_string();
    let access_token = v
        .get("access_token")
        .or_else(|| v.get("accessToken"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    Ok(Account {
        id: Uuid::new_v4().to_string(),
        username,
        uuid,
        kind: "microsoft".into(),
        access_token,
        xuid: v.get("xuid").and_then(|x| x.as_str()).map(|s| s.to_string()),
    })
}

pub fn store_refresh_token(account_key: &str, token: &str) {
    if let Ok(entry) = keyring::Entry::new(AUTH_KEYCHAIN_SERVICE, account_key) {
        let _ = entry.set_password(token);
    }
    // Forget the migrated legacy credential so only the Soul entry remains.
    if let Ok(entry) = keyring::Entry::new(LEGACY_AUTH_KEYCHAIN_SERVICE, account_key) {
        let _ = entry.delete_credential();
    }
}

pub fn load_refresh_token(account_key: &str) -> Option<String> {
    if let Ok(entry) = keyring::Entry::new(AUTH_KEYCHAIN_SERVICE, account_key) {
        if let Ok(token) = entry.get_password() {
            return Some(token);
        }
    }
    keyring::Entry::new(LEGACY_AUTH_KEYCHAIN_SERVICE, account_key)
        .ok()?
        .get_password()
        .ok()
}

pub fn delete_refresh_token(account_key: &str) {
    for service in [AUTH_KEYCHAIN_SERVICE, LEGACY_AUTH_KEYCHAIN_SERVICE] {
        if let Ok(entry) = keyring::Entry::new(service, account_key) {
            let _ = entry.delete_credential();
        }
    }
}

/// Wait for the OAuth callback on a local port (127.0.0.1:8080..8088).
fn wait_for_callback() -> Result<(String, u16), String> {
    let mut listener_opt: Option<TcpListener> = None;
    let mut used_port = 0u16;
    for port in 8080..8089 {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(l) => {
                listener_opt = Some(l);
                used_port = port;
                break;
            }
            Err(_) => continue,
        }
    }
    let listener = listener_opt.ok_or("Couldn't open the local login port (8080)")?;

    // Ask the API for the Microsoft login URL, then open it in the browser.
    // (this part is async, so it's handled by the caller)
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    Ok((String::new(), used_port))
}

fn read_callback(listener: &TcpListener, timeout: std::time::Duration) -> Result<String, String> {
    let start = std::time::Instant::now();
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;
    loop {
        if start.elapsed() > timeout {
            return Err("Login timed out. Please try again.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let body = "<html><head><title>Soul Launcher</title></head><body style=\"font-family:sans-serif;background:#0b0e13;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h1>You're signed in!</h1><p>You can close this tab and go back to Soul Launcher.</p></div></body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
                return Ok(req);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(60));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

pub async fn ms_login(http: &reqwest::Client) -> Result<Account, String> {
    let (_unused, port) = wait_for_callback()?;
    let redirect_uri = format!("http://localhost:{port}/callback");

    let start: Value = http
        .get(format!(
            "{AUTH_API_BASE}/start?launcher_redirect_uri={}",
            urlencode(&redirect_uri)
        ))
        .headers(auth_headers())
        .send()
        .await
        .map_err(|e| format!("Auth service unreachable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Auth service error: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let login_url = start
        .get("url")
        .and_then(|x| x.as_str())
        .ok_or("Auth service returned no login url")?
        .to_string();
    let state = start
        .get("state")
        .and_then(|x| x.as_str())
        .ok_or("Auth service returned no state")?
        .to_string();

    let _ = open::that(&login_url);

    // block for the callback (max 5 min)
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string());
    let req = match listener {
        Ok(l) => read_callback(&l, std::time::Duration::from_secs(300))?,
        Err(_) => return Err("Login port closed early".into()),
    };

    let (code, got_state) = parse_callback_query(&req)?;
    if got_state != state {
        return Err("Login state mismatch - please try again".into());
    }

    let complete: Value = http
        .post(format!("{AUTH_API_BASE}/complete"))
        .headers(auth_headers())
        .json(&json!({ "code": code, "state": state }))
        .send()
        .await
        .map_err(|e| format!("Auth service error: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Auth service error: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut account = api_account_to_account(&complete)?;
    if let Some(rt) = complete
        .get("refresh_token")
        .or_else(|| complete.get("refreshToken"))
        .and_then(|x| x.as_str())
    {
        store_refresh_token(&account.id, rt);
    }
    if account.access_token.is_none() {
        account.access_token = complete
            .get("minecraft_token")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
    }
    Ok(account)
}

pub async fn ms_refresh(http: &reqwest::Client, account: &Account) -> Result<Account, String> {
    let rt = load_refresh_token(&account.id).ok_or("No saved login for this account")?;
    let v: Value = http
        .post(format!("{AUTH_API_BASE}/refresh"))
        .headers(auth_headers())
        .json(&json!({ "refresh_token": rt }))
        .send()
        .await
        .map_err(|e| format!("Auth service unreachable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Login expired, please sign in again ({e})"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut updated = api_account_to_account(&v)?;
    updated.id = account.id.clone();
    if let Some(new_rt) = v
        .get("refresh_token")
        .or_else(|| v.get("refreshToken"))
        .and_then(|x| x.as_str())
    {
        store_refresh_token(&account.id, new_rt);
    }
    Ok(updated)
}

fn parse_callback_query(req: &str) -> Result<(String, String), String> {
    let line = req.lines().next().ok_or("Bad callback request")?;
    let path = line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split('?').nth(1).unwrap_or("");
    let mut code = String::new();
    let mut state = String::new();
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        match (it.next(), it.next()) {
            (Some("code"), Some(v)) => code = urldecode(v),
            (Some("state"), Some(v)) => state = urldecode(v),
            (Some("error"), Some(v)) => return Err(format!("Microsoft error: {}", urldecode(v))),
            _ => {}
        }
    }
    if code.is_empty() {
        return Err("No login code received".into());
    }
    Ok((code, state))
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

fn urldecode(s: &str) -> String {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_uuid_is_java_v3_style() {
        let u = offline_uuid("Steve");
        assert_eq!(u.len(), 36);
        assert_eq!(u.chars().nth(14), Some('3')); // version 3 (MD5 name based), like Java
        // deterministic
        assert_eq!(u, offline_uuid("Steve"));
        assert_ne!(u, offline_uuid("Alex"));
    }

    #[test]
    fn urls_roundtrip() {
        assert_eq!(urlencode("http://localhost:8080/callback"), "http%3A%2F%2Flocalhost%3A8080%2Fcallback");
        assert_eq!(urldecode("hello%20world+again"), "hello world again");
    }

    #[test]
    fn callback_parse() {
        let req = "GET /callback?code=abc123&state=xyz HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let (c, s) = parse_callback_query(req).unwrap();
        assert_eq!(c, "abc123");
        assert_eq!(s, "xyz");
    }
}
