//! Generates per-Space shortcut icons.
//!
//! The Space picker icons are Minecraft block PNGs shipped in the frontend.
//! They are embedded into the binary so a desktop shortcut can carry the same
//! icon the Space shows inside the app. Windows has accepted PNG-compressed
//! images inside .ico containers since Vista, so no image decoding is needed.

use std::path::{Path, PathBuf};

fn space_icon_png(id: &str) -> Option<&'static [u8]> {
    Some(match id {
        "soul" => include_bytes!("../../public/icons/space/soul.png") as &[u8],
        "crafting-table" => include_bytes!("../../public/icons/space/crafting-table.png") as &[u8],
        "diamond-block" => include_bytes!("../../public/icons/space/diamond-block.png"),
        "beacon" => include_bytes!("../../public/icons/space/beacon.png"),
        "enchanting-table" => include_bytes!("../../public/icons/space/enchanting-table.png"),
        "tnt" => include_bytes!("../../public/icons/space/tnt.png"),
        "end-portal-frame" => include_bytes!("../../public/icons/space/end-portal-frame.png"),
        "crafter" => include_bytes!("../../public/icons/space/crafter.png"),
        "chain-command-block" => include_bytes!("../../public/icons/space/chain-command-block.png"),
        "emerald-block" => include_bytes!("../../public/icons/space/emerald-block.png"),
        "amethyst-block" => include_bytes!("../../public/icons/space/amethyst-block.png"),
        "bookshelf" => include_bytes!("../../public/icons/space/bookshelf.png"),
        "carved-pumpkin" => include_bytes!("../../public/icons/space/carved-pumpkin.png"),
        "fletching-table" => include_bytes!("../../public/icons/space/fletching-table.png"),
        "hay-block" => include_bytes!("../../public/icons/space/hay-block.png"),
        "honey-block" => include_bytes!("../../public/icons/space/honey-block.png"),
        "lectern" => include_bytes!("../../public/icons/space/lectern.png"),
        "melon" => include_bytes!("../../public/icons/space/melon.png"),
        "piston" => include_bytes!("../../public/icons/space/piston.png"),
        "shulker-box" => include_bytes!("../../public/icons/space/shulker-box.png"),
        "target" => include_bytes!("../../public/icons/space/target.png"),
        _ => return None,
    })
}

/// Wrap PNG bytes in an .ico container (PNG payload, valid since Vista).
fn png_to_ico(png: &[u8]) -> Result<Vec<u8>, String> {
    // IHDR starts at byte 8: u32 "IHDR" then width/height big-endian.
    if png.len() < 26 || &png[1..4] != b"PNG" {
        return Err("not a PNG".into());
    }
    let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    let mut ico = Vec::with_capacity(22 + png.len());
    // ICONDIR
    ico.extend_from_slice(&0u16.to_le_bytes()); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // type: icon
    ico.extend_from_slice(&1u16.to_le_bytes()); // image count
    // ICONDIRENTRY
    ico.push(if w >= 256 { 0 } else { w as u8 });
    ico.push(if h >= 256 { 0 } else { h as u8 });
    ico.push(0); // palette colors
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // color planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
    ico.extend_from_slice(&(png.len() as u32).to_le_bytes()); // payload size
    ico.extend_from_slice(&22u32.to_le_bytes()); // payload offset
    ico.extend_from_slice(png);
    Ok(ico)
}

/// Writes (or refreshes) the .ico for a Space and returns its path.
/// Unknown or legacy icon ids fall back to the Soul logo mark.
pub fn write_space_ico(root: &Path, space_id: &str, icon_id: &str) -> Result<PathBuf, String> {
    let png = space_icon_png(icon_id).unwrap_or(include_bytes!("../../public/icons/space/crafting-table.png") as &[u8]);
    let dir = root.join("shortcut-icons");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{space_id}.ico"));
    std::fs::write(&path, png_to_ico(png)?).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Removes the generated icon for a Space (unpin / delete flows).
pub fn remove_space_ico(root: &Path, space_id: &str) {
    let _ = std::fs::remove_file(root.join("shortcut-icons").join(format!("{space_id}.ico")));
}
