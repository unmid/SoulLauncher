//! Server list: remote JSON (from the SoulLauncher repo) + Minecraft
//! Server List Ping (SLP 1.7+) for live player counts and latency.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServer {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub ip: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub motd: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub sponsored: bool,
    #[serde(default)]
    pub min_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub online: bool,
    pub players_online: u64,
    pub players_max: u64,
    pub motd: String,
    pub icon: String,
    pub version: String,
    pub ping_ms: u64,
}

// ---------------------------------------------------------------------------
// address parsing

/// Split `host`, `host:port`, `[v6]` or `[v6]:port` into (host, port).
/// IPv6 literals must be bracketed; a bare multi-colon string is treated as
/// an unbracketed IPv6 address (last segment is NOT a port in that case).
pub fn split_host_port(addr: &str, default_port: u16) -> (String, u16) {
    let addr = addr.trim();
    if let Some(rest) = addr.strip_prefix('[') {
        // [v6] or [v6]:port
        if let Some(end) = rest.find(']') {
            let host = rest[..end].to_string();
            let after = &rest[end + 1..];
            let port = after
                .strip_prefix(':')
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(default_port);
            return (host, port);
        }
    }
    match addr.rsplit_once(':') {
        // exactly one colon and a numeric right side → host:port
        Some((host, port)) if !host.contains(':') && !host.is_empty() => {
            match port.parse::<u16>() {
                Ok(p) => (host.to_string(), p),
                Err(_) => (addr.to_string(), default_port),
            }
        }
        _ => (addr.to_string(), default_port),
    }
}

/// Is this a plausible Minecraft server host? (domain, IPv4, IPv6 or localhost)
fn valid_host(host: &str) -> bool {
    if host.is_empty() || host.len() > 253 || host.contains('/') || host.contains('?') || host.contains('&') {
        return false;
    }
    if host.contains(':') {
        // unbracketed IPv6: only hex digits, colons and dots allowed
        return host
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == ':' || c == '.');
    }
    host.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

// ---------------------------------------------------------------------------
// SLP wire format

fn write_varint(out: &mut Vec<u8>, v: i64) {
    // unsigned LEB128 (two's-complement safe for negatives)
    let mut v = v as u64;
    loop {
        let mut b = (v & 0x7F) as u8;
        v >>= 7;
        if v != 0 {
            b |= 0x80;
        }
        out.push(b);
        if v == 0 {
            break;
        }
    }
}

fn read_varint(stream: &mut impl Read) -> std::io::Result<i64> {
    let mut result: i64 = 0;
    let mut shift = 0;
    loop {
        let mut b = [0u8; 1];
        stream.read_exact(&mut b)?;
        result |= ((b[0] & 0x7F) as i64) << shift;
        if b[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 63 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "varint too long"));
        }
    }
    Ok(result)
}

fn read_n(stream: &mut impl Read, n: usize) -> std::io::Result<Vec<u8>> {
    let mut buf = vec![0u8; n];
    stream.read_exact(&mut buf)?;
    Ok(buf)
}

fn motd_to_text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Object(_) => {
            let mut out = String::new();
            if let Some(t) = v.get("text").and_then(|x| x.as_str()) {
                out.push_str(t);
            }
            if let Some(extra) = v.get("extra").and_then(|x| x.as_array()) {
                for e in extra {
                    out.push_str(&motd_to_text(e));
                }
            }
            if out.is_empty() {
                // hover-event-free description objects sometimes translate
                v.get("translate").and_then(|x| x.as_str()).unwrap_or("").to_string()
            } else {
                out
            }
        }
        serde_json::Value::Array(a) => a.iter().map(motd_to_text).collect::<Vec<_>>().join(" "),
        _ => String::new(),
    }
}

/// SLP ping against a pre-resolved address (the async command layer resolves
/// the host with a bounded timeout, so DNS can never wedge a ping forever).
/// The handshake still carries the original hostname — proxies such as
/// BungeeCord route on it.
pub fn ping_addr(addr: SocketAddr, host: &str, port: u16, timeout_ms: u64) -> Result<PingResult, String> {
    let timeout = Duration::from_millis(timeout_ms.max(500));

    let mut stream = std::net::TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("Server offline ({e})"))?;
    stream.set_read_timeout(Some(timeout)).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(timeout)).map_err(|e| e.to_string())?;
    stream.set_nodelay(true).ok();

    // latency clock starts after DNS + TCP: it must reflect the game hop,
    // not how fast the OS resolved the name.
    let connect_start = Instant::now();

    // handshake
    let mut data: Vec<u8> = Vec::new();
    write_varint(&mut data, 0); // packet id
    write_varint(&mut data, 767); // protocol version (any modern)
    let host_bytes = host.as_bytes();
    write_varint(&mut data, host_bytes.len() as i64);
    data.extend_from_slice(host_bytes);
    data.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut data, 1); // next state: status
    let mut packet: Vec<u8> = Vec::new();
    write_varint(&mut packet, data.len() as i64);
    packet.extend_from_slice(&data);
    stream.write_all(&packet).map_err(|e| e.to_string())?;

    // status request
    stream.write_all(&[1, 0]).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;

    // response
    let _len = read_varint(&mut stream).map_err(|e| e.to_string())?;
    let id = read_varint(&mut stream).map_err(|e| e.to_string())?;
    if id != 0 {
        return Err("Bad ping response".into());
    }
    let json_len = read_varint(&mut stream).map_err(|e| e.to_string())? as usize;
    let json_bytes = read_n(&mut stream, json_len.min(1 << 20)).map_err(|e| e.to_string())?;
    let status_ms = connect_start.elapsed().as_millis() as u64;
    let v: serde_json::Value =
        serde_json::from_slice(&json_bytes).map_err(|e| format!("Bad ping data: {e}"))?;

    // latency: prefer the SLP ping/pong round trip, but some proxies and
    // vanilla-ish servers close the socket right after the status response.
    // Their answer is the status RTT we already measured.
    let ping_ms = {
        let mut ping_pkt: Vec<u8> = Vec::new();
        write_varint(&mut ping_pkt, 9);
        write_varint(&mut ping_pkt, 1);
        ping_pkt.extend_from_slice(&42i64.to_be_bytes());
        let t = Instant::now();
        if stream.write_all(&ping_pkt).is_ok() && stream.flush().is_ok() {
            let mut pong = [0u8; 10];
            stream.read_exact(&mut pong).ok().map(|_| t.elapsed().as_millis() as u64)
        } else {
            None
        }
    }
    .unwrap_or(status_ms);

    let players_online = v
        .get("players")
        .and_then(|p| p.get("online"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let players_max = v
        .get("players")
        .and_then(|p| p.get("max"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let motd = v.get("description").map(motd_to_text).unwrap_or_default();
    let icon = v
        .get("favicon")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let version = v
        .get("version")
        .and_then(|p| p.get("name"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    Ok(PingResult {
        online: true,
        players_online,
        players_max,
        motd: motd.trim().to_string(),
        icon,
        version,
        ping_ms,
    })
}

use std::net::{SocketAddr, ToSocketAddrs};

/// Blocking convenience wrapper (selftest + unit tests): resolve, then ping.
#[allow(dead_code)]
pub fn ping_server(host: &str, port: u16, timeout_ms: u64) -> Result<PingResult, String> {
    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|e| format!("DNS lookup failed: {e}"))?
        .next()
        .ok_or("No address for host")?;
    ping_addr(addr, host, port, timeout_ms)
}

// ---------------------------------------------------------------------------
// Remote list parsing (strict: drop anything suspicious)

pub fn parse_server_list(raw: &str) -> Vec<RemoteServer> {
    let v: serde_json::Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let arr = match v.get("servers").and_then(|x| x.as_array()) {
        Some(a) => a,
        None => return vec![],
    };
    let mut out = Vec::new();
    for item in arr.iter().take(64) {
        let get = |k: &str| item.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        let name = clean_text(&get("name"), 48);
        let raw_ip = get("ip");
        if name.is_empty() || raw_ip.is_empty() {
            continue;
        }
        let (host, embedded_port) = split_host_port(&raw_ip, 25565);
        if !valid_host(&host) {
            continue;
        }
        let port = item
            .get("port")
            .and_then(|x| x.as_u64())
            .map(|p| p as u16)
            .or(Some(embedded_port));
        out.push(RemoteServer {
            name,
            ip: host,
            port,
            icon: clean_url(&get("icon")),
            motd: clean_text(&get("motd"), 120),
            category: {
                let c = clean_text(&get("category"), 24);
                if c.is_empty() { "Servers".into() } else { c }
            },
            sponsored: item.get("sponsored").and_then(|x| x.as_bool()).unwrap_or(false),
            min_version: clean_text(&get("minVersion"), 16),
        });
    }
    out
}

fn clean_text(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

fn clean_url(s: &str) -> String {
    if s.starts_with("https://") || s.starts_with("data:image/png;base64,") {
        clean_text(s, 4096)
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_roundtrip() {
        for v in [0i64, 1, 127, 128, 255, 2147483647, -1, -2147483648] {
            let mut buf = Vec::new();
            write_varint(&mut buf, v);
            // two's complement for negatives is fine for our positive use,
            // but make sure positive values roundtrip through reader:
            if v >= 0 {
                let mut slice = &buf[..];
                assert_eq!(read_varint(&mut slice).unwrap(), v);
            }
        }
    }

    #[test]
    fn parse_list_filters_bad() {
        let raw = r#"{"servers":[
            {"name":"Cool SMP","ip":"play.cool.gg","category":"Survival","motd":"hi","sponsored":true},
            {"name":"","ip":"play.cool.gg"},
            {"name":"Bad","ip":"http://evil.com/x?y=1"},
            {"name":"Ok","ip":"mc.ok.net:25566"}
        ]}"#;
        let list = parse_server_list(raw);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Cool SMP");
        assert!(list[0].sponsored);
        assert_eq!(list[0].ip, "play.cool.gg");
        // embedded port is split out, never pinged with the default port
        assert_eq!(list[1].ip, "mc.ok.net");
        assert_eq!(list[1].port, Some(25566));
    }

    #[test]
    fn host_port_splitting() {
        assert_eq!(split_host_port("play.hypixel.net", 25565), ("play.hypixel.net".into(), 25565));
        assert_eq!(split_host_port("play.hypixel.net:25577", 25565), ("play.hypixel.net".into(), 25577));
        assert_eq!(split_host_port("localhost", 25565), ("localhost".into(), 25565));
        assert_eq!(split_host_port("[::1]:25565", 25565), ("::1".into(), 25565));
        // unbracketed IPv6 keeps its colons (a bare port would be nonsense)
        let (h, p) = split_host_port("2001:db8::1", 25565);
        assert_eq!(h, "2001:db8::1");
        assert_eq!(p, 25565);
    }
}
