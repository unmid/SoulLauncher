# Soul Launcher

[![Release](https://img.shields.io/github/v/release/unmid/SoulLauncher)](https://github.com/unmid/SoulLauncher/releases)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/unmid/SoulLauncher/releases)

A fast, lightweight Minecraft launcher for Windows. Every Minecraft setup lives in its own isolated **Space** — one version, one loader, its own mods, worlds, and settings — and categories keep servers and settings in sync between Spaces that play together.

Built with Tauri 2, React 19, Rust, and Vite. On a normal gaming PC it idles at roughly **125 MB of RAM**, so your memory stays with the game.

> **Beta.** It runs well day to day, but there are rough edges. Bug reports with logs and steps are genuinely useful — see [Feedback](#feedback).

**Website:** [unmid.github.io/SoulLauncher](https://unmid.github.io/SoulLauncher) · **Download:** [latest release](https://github.com/unmid/SoulLauncher/releases)

## Download

Get `SoulLauncher-Setup.exe` from the [release page](https://github.com/unmid/SoulLauncher/releases) and run it. Installed copies update themselves.

Windows SmartScreen will warn you once: the beta is not code-signed, so Windows has no reputation to check against. Choose **More info** → **Run anyway**, or build it yourself from this repository — same bytes, your machine.

## What it does

- **Isolated Spaces.** Each Space is one Minecraft version with its own loader, mods, worlds, and settings. A broken 1.8.9 Forge experiment cannot touch your Fabric world. Vanilla, Fabric, Quilt, Forge, NeoForge, OptiFine, and client builds all mix freely.
- **Categories that sync themselves.** Group Spaces that play together. Each category owns one shared `servers.dat` and `options.txt` (real OS symlinks, with a copy fallback). Add a server in-game on one Space and every member of the category has it. There is no manual "manage servers" screen — the game files are the source of truth.
- **Installs itself.** Java, libraries, assets, natives, and loaders download and verify automatically. Progress shows on the Space card.
- **Content browsing with version honesty.** Modrinth and CurseForge search resolves files for your exact Minecraft version and loader. When nothing compatible exists, it says so instead of quietly installing the wrong file.
- **Modpacks become their own Space.** `.mrpack` and CurseForge zips install as a new Space instead of merging blindly into what you already had.
- **Microsoft sign-in** through the official flow, plus offline accounts, skin preview/upload, and cape selection.
- **No telemetry.** No ads, no account required for offline play, everything stored locally under `%APPDATA%\SoulLauncher`.

Exported Spaces use `.soulspace.json`. Log file: `%APPDATA%\SoulLauncher\logs\soul.log` (Settings → Logs shows it in-app).

## Fork of OpenLauncher

Soul Launcher is a fork of [OpenLauncher](https://github.com/openlauncherteam/openlauncher). The fork keeps OpenLauncher's official Microsoft sign-in service — which is why the login window says "OpenLauncher", and why your credentials only ever go to Microsoft — and rebuilds nearly everything else: isolated Spaces, automatic category sync, the Soul Client build system, content browsing with version honesty, and a new interface. If you used Orbit Launcher, your data folder migrates on first start instead of forcing a redownload.

## Soul Client

**Soul Client** is this project's own tuned Fabric FPS build, installed from inside the launcher in one click — no separate website, no mystery binary. Every mod in it is a public Modrinth project the launcher resolves, downloads, and records.

Current build (**26.2**): Minecraft 26.2, Fabric Loader 0.19.5, 24 public performance and stability mods (Sodium, Lithium, FerriteCore, Entity Culling, ImmediatelyFast, Iris, spark, and more), 4 GB recommended RAM. A mod that fails to download is reported, not skipped in silence.

Builds are defined in [`client/`](client/): `versions.json` is the menu the launcher reads, and each `version-<id>/` folder holds a small zip whose `soul-client.json` manifest lists the mods by Modrinth project ID. Full format rules are documented in the manifest files themselves — the launcher validates them (Fabric only, Modrinth only, max 80 mods, safe zip paths).

## Building from source

You need Node.js 22+, Rust stable, and the normal [Tauri 2 Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run build          # frontend
cargo test --workspace # backend tests
npm run tauri dev      # development
npm run tauri build    # full local installer
```

The workspace shares one version across the root `Cargo.toml`, `package.json`, and `src-tauri/tauri.conf.json`. Public clones build without private tokens: features that need a GitHub or CurseForge key degrade gracefully instead of failing the build.

## Repository layout

```text
src/                  React frontend (pages, components, icons, styles)
src-tauri/            Rust backend (install, launch, accounts, content, sync)
public/               fonts, icons, wallpapers
client/               Soul Client builds and manifests
serverlist.json       live server list for the Servers page
docs/                 website (GitHub Pages)
home/                 extra hosted pages
```

How the code fits together, briefly: `src-tauri/src/main.rs` is the Tauri command registry; `launch.rs` is the install-and-launch pipeline; `categories.rs` + `servers_dat.rs` implement category sync with real NBT parsing and symlink helpers; `loaders.rs` installs Fabric/Quilt/Forge/NeoForge/OptiFine; `content.rs` handles Modrinth/CurseForge with version honesty; `soulclient.rs` installs this repo's own client builds. On the frontend, `App.jsx` is the shell, `SpaceWizard.jsx` is the New/Edit Space flow, `LibraryPage.jsx` is Spaces plus drag-and-drop categories, `ModsBrowser.jsx` is content search, and `api.js` is the single bridge to the backend.

## Website

The product page lives in [`docs/`](docs/) and is served by GitHub Pages at [unmid.github.io/SoulLauncher](https://unmid.github.io/SoulLauncher) — same dark theme as the app, download button, feature tour, and a live preview of `serverlist.json`. On a fork: Settings → Pages → Deploy from branch → `main` + `/docs`.

## Releases

Windows releases are produced from `v*` tags by [`.github/workflows/release.yml`](.github/workflows/release.yml): NSIS installer, signed Tauri updater artifacts, `latest.json`. Installed copies verify update signatures before installing (public key embedded in the app). The signing key belongs in Actions secrets, never in git.

## Feedback

Beta bug reports belong at [github.com/unmid/SoulLauncher/issues](https://github.com/unmid/SoulLauncher/issues). A useful one has four things:

1. The launcher version (Settings shows it).
2. What you clicked and what you expected.
3. The exact error text, if any.
4. The tail of the log from Settings → Logs.

## License

GPL-3.0-only. See [`LICENSE`](LICENSE).
