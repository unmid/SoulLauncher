//! Real Minecraft persistence layer: `servers.dat` (gzipped NBT) + `options.txt`.
//!
//! This is NOT a mock. It implements the actual on-disk formats Minecraft reads:
//!   * `servers.dat` = gzip(NBT) with root TAG_Compound { TAG_List("servers") of TAG_Compound { "name", "ip", ... } }
//!   * `options.txt` = plain `key:value` lines (e.g. `fov:70.0`, `graphics:1`)
//!
//! Category sharing links every member Space's files to
//! `categories/<id>/shared/{servers.dat,options.txt}` via OS symlinks
//! (copy fallback when symlink privilege is missing). Edits go through this
//! module so in-game changes propagate instantly across the category.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Public shapes (sent to the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryServer {
    pub name: String,
    pub ip: String,
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryOptions {
    /// Ordered key:value pairs as they appear in options.txt
    pub entries: Vec<[String; 2]>,
}

// ---------------------------------------------------------------------------
// NBT — minimal but complete generic implementation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum NbtTag {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<u8>),
    Str(String),
    List(u8, Vec<NbtTag>),
    Compound(HashMap<String, NbtTag>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

fn tag_id(t: &NbtTag) -> u8 {
    match t {
        NbtTag::Byte(_) => 1,
        NbtTag::Short(_) => 2,
        NbtTag::Int(_) => 3,
        NbtTag::Long(_) => 4,
        NbtTag::Float(_) => 5,
        NbtTag::Double(_) => 6,
        NbtTag::ByteArray(_) => 7,
        NbtTag::Str(_) => 8,
        NbtTag::List(_, _) => 9,
        NbtTag::Compound(_) => 10,
        NbtTag::IntArray(_) => 11,
        NbtTag::LongArray(_) => 12,
    }
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }
    fn need(&self, n: usize) -> Result<(), String> {
        if self.pos + n <= self.buf.len() {
            Ok(())
        } else {
            Err("servers.dat is truncated".into())
        }
    }
    fn u8(&mut self) -> Result<u8, String> {
        self.need(1)?;
        let v = self.buf[self.pos];
        self.pos += 1;
        Ok(v)
    }
    fn be_u16(&mut self) -> Result<u16, String> {
        self.need(2)?;
        let v = u16::from_be_bytes([self.buf[self.pos], self.buf[self.pos + 1]]);
        self.pos += 2;
        Ok(v)
    }
    fn be_i16(&mut self) -> Result<i16, String> {
        Ok(self.be_u16()? as i16)
    }
    fn be_i32(&mut self) -> Result<i32, String> {
        self.need(4)?;
        let v = i32::from_be_bytes([
            self.buf[self.pos],
            self.buf[self.pos + 1],
            self.buf[self.pos + 2],
            self.buf[self.pos + 3],
        ]);
        self.pos += 4;
        Ok(v)
    }
    fn be_i64(&mut self) -> Result<i64, String> {
        self.need(8)?;
        let mut b = [0u8; 8];
        b.copy_from_slice(&self.buf[self.pos..self.pos + 8]);
        self.pos += 8;
        Ok(i64::from_be_bytes(b))
    }
    fn be_f32(&mut self) -> Result<f32, String> {
        Ok(f32::from_bits(self.be_i32()? as u32))
    }
    fn be_f64(&mut self) -> Result<f64, String> {
        Ok(f64::from_bits(self.be_i64()? as u64))
    }
    fn bytes(&mut self, n: usize) -> Result<Vec<u8>, String> {
        self.need(n)?;
        let v = self.buf[self.pos..self.pos + n].to_vec();
        self.pos += n;
        Ok(v)
    }
    fn nbt_string(&mut self) -> Result<String, String> {
        let len = self.be_u16()? as usize;
        let b = self.bytes(len)?;
        String::from_utf8(b).map_err(|_| "servers.dat has non-UTF8 text".to_string())
    }
}

fn read_payload(r: &mut Reader, id: u8) -> Result<NbtTag, String> {
    match id {
        1 => Ok(NbtTag::Byte(r.u8()? as i8)),
        2 => Ok(NbtTag::Short(r.be_i16()?)),
        3 => Ok(NbtTag::Int(r.be_i32()?)),
        4 => Ok(NbtTag::Long(r.be_i64()?)),
        5 => Ok(NbtTag::Float(r.be_f32()?)),
        6 => Ok(NbtTag::Double(r.be_f64()?)),
        7 => {
            let n = r.be_i32()? as usize;
            if n > 4_000_000 {
                return Err("ByteArray too large".into());
            }
            Ok(NbtTag::ByteArray(r.bytes(n)?))
        }
        8 => Ok(NbtTag::Str(r.nbt_string()?)),
        9 => {
            let elem = r.u8()?;
            let n = r.be_i32()? as usize;
            if n > 100_000 {
                return Err("List too large".into());
            }
            let mut items = Vec::with_capacity(n.min(4096));
            for _ in 0..n {
                items.push(read_payload(r, elem)?);
            }
            Ok(NbtTag::List(elem, items))
        }
        10 => {
            let mut map = HashMap::new();
            loop {
                let id = r.u8()?;
                if id == 0 {
                    break;
                }
                let name = r.nbt_string()?;
                let val = read_payload(r, id)?;
                map.insert(name, val);
            }
            Ok(NbtTag::Compound(map))
        }
        11 => {
            let n = r.be_i32()? as usize;
            if n > 2_000_000 {
                return Err("IntArray too large".into());
            }
            let mut v = Vec::with_capacity(n.min(4096));
            for _ in 0..n {
                v.push(r.be_i32()?);
            }
            Ok(NbtTag::IntArray(v))
        }
        12 => {
            let n = r.be_i32()? as usize;
            if n > 2_000_000 {
                return Err("LongArray too large".into());
            }
            let mut v = Vec::with_capacity(n.min(4096));
            for _ in 0..n {
                v.push(r.be_i64()?);
            }
            Ok(NbtTag::LongArray(v))
        }
        _ => Err(format!("unknown NBT tag {id}")),
    }
}

fn write_payload(out: &mut Vec<u8>, tag: &NbtTag) {
    match tag {
        NbtTag::Byte(v) => out.push(*v as u8),
        NbtTag::Short(v) => out.extend_from_slice(&v.to_be_bytes()),
        NbtTag::Int(v) => out.extend_from_slice(&v.to_be_bytes()),
        NbtTag::Long(v) => out.extend_from_slice(&v.to_be_bytes()),
        NbtTag::Float(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        NbtTag::Double(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        NbtTag::ByteArray(b) => {
            out.extend_from_slice(&(b.len() as i32).to_be_bytes());
            out.extend_from_slice(b);
        }
        NbtTag::Str(s) => {
            let b = s.as_bytes();
            out.extend_from_slice(&(b.len() as u16).to_be_bytes());
            out.extend_from_slice(b);
        }
        NbtTag::List(elem, items) => {
            out.push(*elem);
            out.extend_from_slice(&(items.len() as i32).to_be_bytes());
            for it in items {
                write_payload(out, it);
            }
        }
        NbtTag::Compound(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                let v = &map[k];
                out.push(tag_id(v));
                let kb = k.as_bytes();
                out.extend_from_slice(&(kb.len() as u16).to_be_bytes());
                out.extend_from_slice(kb);
                write_payload(out, v);
            }
            out.push(0);
        }
        NbtTag::IntArray(v) => {
            out.extend_from_slice(&(v.len() as i32).to_be_bytes());
            for x in v {
                out.extend_from_slice(&x.to_be_bytes());
            }
        }
        NbtTag::LongArray(v) => {
            out.extend_from_slice(&(v.len() as i32).to_be_bytes());
            for x in v {
                out.extend_from_slice(&x.to_be_bytes());
            }
        }
    }
}

fn decode_root(raw: &[u8]) -> Result<HashMap<String, NbtTag>, String> {
    // servers.dat may be gzip-wrapped or raw NBT (old / external tools).
    let decompressed: Vec<u8> = if raw.len() >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
        let mut d = flate2::read::GzDecoder::new(raw);
        let mut out = Vec::new();
        d.read_to_end(&mut out).map_err(|e| format!("gunzip servers.dat: {e}"))?;
        out
    } else {
        raw.to_vec()
    };
    let mut r = Reader::new(&decompressed);
    let root_id = r.u8()?;
    if root_id != 10 {
        return Err("servers.dat root is not a compound".into());
    }
    let _root_name = r.nbt_string()?;
    match read_payload(&mut r, 10)? {
        NbtTag::Compound(m) => Ok(m),
        _ => Err("bad root".into()),
    }
}

fn encode_root(root: &HashMap<String, NbtTag>) -> Vec<u8> {
    let mut raw = Vec::with_capacity(2048);
    raw.push(10);
    raw.extend_from_slice(&0u16.to_be_bytes()); // empty root name
    write_payload(&mut raw, &NbtTag::Compound(root.clone()));
    // gzip it — that is what vanilla Minecraft writes
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(&raw).expect("gzip");
    enc.finish().expect("gzip finish")
}

// ---------------------------------------------------------------------------
// servers.dat high-level API
// ---------------------------------------------------------------------------

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect::<String>().trim().to_string()
}

pub fn read_servers_dat(path: &Path) -> Result<Vec<CategoryServer>, String> {
    if !path.is_file() {
        return Ok(vec![]);
    }
    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    if raw.is_empty() {
        return Ok(vec![]);
    }
    let root = decode_root(&raw)?;
    let list = match root.get("servers") {
        Some(NbtTag::List(_, items)) => items.clone(),
        Some(_) => return Err("servers.dat: 'servers' is not a list".into()),
        None => return Ok(vec![]),
    };
    let mut out = Vec::new();
    for item in list.into_iter().take(512) {
        let map = match item {
            NbtTag::Compound(m) => m,
            _ => continue,
        };
        let name = match map.get("name") {
            Some(NbtTag::Str(s)) => clean(s, 64),
            _ => String::new(),
        };
        let ip = match map.get("ip") {
            Some(NbtTag::Str(s)) => clean(s, 253),
            _ => String::new(),
        };
        if name.is_empty() || ip.is_empty() {
            continue;
        }
        let icon = match map.get("icon") {
            Some(NbtTag::Str(s)) if s.starts_with("data:image/png;base64,") => clean(s, 65536),
            _ => String::new(),
        };
        out.push(CategoryServer { name, ip, icon });
    }
    Ok(out)
}

/// Write servers, preserving unknown per-entry tags when the file already exists
/// (e.g. `acceptTextures`) by merging on `ip`.
pub fn write_servers_dat(path: &Path, servers: &[CategoryServer]) -> Result<(), String> {
    if servers.len() > 512 {
        return Err("too many servers (max 512)".into());
    }
    // Load existing compounds to preserve extra fields.
    let mut existing: HashMap<String, HashMap<String, NbtTag>> = HashMap::new();
    if path.is_file() {
        if let Ok(raw) = std::fs::read(path) {
            if !raw.is_empty() {
                if let Ok(root) = decode_root(&raw) {
                    if let Some(NbtTag::List(_, items)) = root.get("servers") {
                        for it in items {
                            if let NbtTag::Compound(m) = it {
                                if let Some(NbtTag::Str(ip)) = m.get("ip") {
                                    existing.insert(ip.clone(), m.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let mut items = Vec::with_capacity(servers.len());
    for s in servers {
        let name = clean(&s.name, 64);
        let ip = clean(&s.ip, 253);
        if name.is_empty() || ip.is_empty() {
            return Err("server name and address are required".into());
        }
        if ip.contains('/') || ip.contains('?') || ip.contains(' ') {
            return Err(format!("bad server address: {ip}"));
        }
        let mut m = existing.remove(&ip).unwrap_or_default();
        m.insert("name".into(), NbtTag::Str(name));
        m.insert("ip".into(), NbtTag::Str(ip));
        let icon = clean(&s.icon, 65536);
        if !icon.is_empty() {
            if !icon.starts_with("data:image/png;base64,") {
                return Err("server icon must be a data URL".into());
            }
            m.insert("icon".into(), NbtTag::Str(icon));
        } else {
            m.remove("icon");
        }
        items.push(NbtTag::Compound(m));
    }
    let mut root = HashMap::new();
    root.insert("servers".into(), NbtTag::List(10, items));
    let bytes = encode_root(&root);
    atomic_write(path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// options.txt high-level API
// ---------------------------------------------------------------------------

/// Parse options.txt preserving order. Lines without ':' are kept as-is with empty value.
pub fn read_options_txt(path: &Path) -> Result<CategoryOptions, String> {
    if !path.is_file() {
        return Ok(CategoryOptions { entries: vec![] });
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for line in raw.lines().take(4096) {
        if line.is_empty() {
            continue;
        }
        match line.split_once(':') {
            Some((k, v)) => entries.push([k.to_string(), v.to_string()]),
            None => entries.push([line.to_string(), String::new()]),
        }
    }
    Ok(CategoryOptions { entries })
}

pub fn write_options_txt(path: &Path, entries: &[[String; 2]]) -> Result<(), String> {
    if entries.len() > 4096 {
        return Err("too many options".into());
    }
    let mut out = String::new();
    for [k, v] in entries {
        let k = k.trim();
        if k.is_empty() || k.len() > 128 || k.chars().any(|c| c.is_control() || c == '\n' || c == '\r') {
            return Err(format!("bad option key: {k}"));
        }
        let v = v.replace(['\n', '\r'], "");
        if v.len() > 8192 {
            return Err(format!("option value too long: {k}"));
        }
        if v.is_empty() && !k.contains(':') {
            out.push_str(k);
        } else {
            out.push_str(k);
            out.push(':');
            out.push_str(&v);
        }
        out.push('\n');
    }
    atomic_write(path, out.as_bytes())
}

/// Merge helper used at launch: shared category options win for keys the user
/// actually set; unknown local keys are kept (e.g. mod-added settings).
#[allow(dead_code)]
pub fn merge_options_shared_wins(local: &[[String; 2]], shared: &[[String; 2]]) -> Vec<[String; 2]> {
    let mut order: Vec<String> = Vec::new();
    let mut map: HashMap<String, String> = HashMap::new();
    for [k, v] in local {
        if !map.contains_key(k) {
            order.push(k.clone());
        }
        map.insert(k.clone(), v.clone());
    }
    for [k, v] in shared {
        if !map.contains_key(k) {
            order.push(k.clone());
        }
        map.insert(k.clone(), v.clone());
    }
    order.into_iter().map(|k| [k.clone(), map[&k].clone()]).collect()
}

// ---------------------------------------------------------------------------
// Symlink helpers — the instant-propagation layer
// ---------------------------------------------------------------------------

/// Resolve a path through symlinks for comparison.
pub fn resolve(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub fn is_linked_to(link: &Path, target: &Path) -> bool {
    let meta = std::fs::symlink_metadata(link);
    if meta.map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        if let Ok(dest) = std::fs::read_link(link) {
            let abs_dest = if dest.is_absolute() {
                dest.clone()
            } else {
                link.parent().map(|p| p.join(&dest)).unwrap_or(dest.clone())
            };
            return resolve(&abs_dest) == resolve(target);
        }
    }
    false
}

/// Replace `link` with a symlink to `target`. Falls back to a plain copy when
/// the OS refuses (Windows without Developer Mode / admin).
/// Returns "symlink" or "copy".
pub fn link_or_copy(shared: &Path, link: &Path) -> Result<&'static str, String> {
    if is_linked_to(link, shared) {
        return Ok("symlink");
    }
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = shared.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if !shared.exists() {
        // Nothing shared yet — if the space has its own file, seed shared from it.
        if link.is_file() && !std::fs::symlink_metadata(link).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
            std::fs::copy(link, shared).map_err(|e| e.to_string())?;
        } else {
            return Ok("copy");
        }
    }
    // Remove whatever is at link (file or stale symlink), then link.
    let _ = std::fs::remove_file(link);
    let _ = std::fs::remove_dir(link);

    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(shared, link).is_ok();
    #[cfg(not(windows))]
    let linked = std::os::unix::fs::symlink(shared, link).is_ok();

    if linked {
        return Ok("symlink");
    }
    // Fallback: plain copy (still correct, just not instant).
    std::fs::copy(shared, link).map_err(|e| format!("link failed, copy failed: {e}"))?;
    Ok("copy")
}

/// Break a symlink back into a real file (used when a Space leaves a category).
pub fn unlink_to_copy(link: &Path) -> Result<(), String> {
    let is_link = std::fs::symlink_metadata(link).map(|m| m.file_type().is_symlink()).unwrap_or(false);
    if !is_link {
        return Ok(());
    }
    let bytes = std::fs::read(link).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(link);
    std::fs::write(link, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn servers_dat_roundtrip() {
        let dir = std::env::temp_dir().join(format!("soul-nbt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("servers.dat");
        let servers = vec![
            CategoryServer { name: "Hypixel".into(), ip: "mc.hypixel.net".into(), icon: String::new() },
            CategoryServer { name: "Local".into(), ip: "localhost:25565".into(), icon: String::new() },
        ];
        write_servers_dat(&p, &servers).unwrap();
        let back = read_servers_dat(&p).unwrap();
        assert_eq!(back.len(), 2);
        assert_eq!(back[0].ip, "mc.hypixel.net");
        // vanilla-compat: file starts with gzip magic
        let raw = std::fs::read(&p).unwrap();
        assert_eq!(&raw[0..2], &[0x1f, 0x8b]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn options_roundtrip() {
        let dir = std::env::temp_dir().join(format!("soul-opt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("options.txt");
        write_options_txt(&p, &[
            ["fov".into(), "70.0".into()],
            ["graphics".into(), "1".into()],
        ]).unwrap();
        let back = read_options_txt(&p).unwrap();
        assert_eq!(back.entries.len(), 2);
        assert_eq!(back.entries[0][0], "fov");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
