# Soul Launcher

[![Release](https://img.shields.io/github/v/release/unmid/SoulLauncher?include_prereleases)](https://github.com/unmid/SoulLauncher/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/unmid/SoulLauncher/releases)

Soul Launcher is a fast, lightweight Minecraft launcher for Windows. It keeps every Minecraft setup in an isolated **Space**: one Minecraft version, one loader or client build, its own mods, resource packs, shaders, datapacks, worlds, and settings.

> **Beta (v1.0.0-beta).** It runs well day to day, but you will find rough edges. Bug reports with logs and steps are genuinely useful — see [Beta and feedback](#beta-and-feedback).

The launcher itself is built with Tauri 2, React 19, Rust, and Vite. On an ordinary gaming PC it normally sits at roughly **125 MB of RAM while idle**. That number moves with your library size, background music, wallpapers, and open dialogs, but the design goal is simple: the launcher should disappear into the background and leave your memory for Minecraft.

The other half of the project is **Soul Client**, currently at version **26.2**: a tuned Fabric FPS build made from public, inspectable mods. Install it from inside Soul Launcher in one click.

## Where it comes from

Soul Launcher is a fork of [OpenLauncher](https://github.com/openlauncherteam/openlauncher). The fork keeps OpenLauncher's official Microsoft sign-in service — which is why the login window says "OpenLauncher", and why your credentials only ever go to Microsoft — and rebuilds nearly everything else: isolated Spaces, automatic category sync, the Soul Client build system, content browsing with version honesty, and a new interface. If you used Orbit Launcher, your data folder migrates on first start instead of forcing a redownload.

## Why this launcher exists

Most launchers make you manage folders, profiles, Java versions, loader installers, and mod compatibility yourself. Soul Launcher moves that work into one predictable flow:

1. Create a Space.
2. Pick Minecraft and software.
3. Add content if you want it.
4. Press Play.

Behind that short flow is a stricter install pipeline:

- Every Space is isolated. A broken 1.8.9 Forge experiment cannot touch your modern Fabric world.
- Minecraft, loaders, Java, and content are downloaded and verified automatically.
- Modrinth and CurseForge installs resolve files for the Space’s actual Minecraft version and loader.
- Modpacks become their own Space instead of being merged blindly into whatever you already had.
- Progress is visible on the Space card while downloads happen.
- Everything important is stored locally under your Soul Launcher data folder.

## Soul Client 26.2

Soul Client is not a separate download from another website. It lives in this repository and installs through the same Space system as everything else.

Version 26.2 contains:

- Minecraft **26.2**
- Fabric Loader **0.19.5**
- 24 public Fabric mods
- 4 GB of recommended RAM
- Soul branding for the Space icon and shortcut

### What the 24 mods do

The build favors measurable client performance, memory behavior, startup/rendering efficiency, and stability:

- Fabric API
- Sodium
- Sodium Extra
- Reese’s Sodium Options
- Cloth Config API
- Lithium
- FerriteCore
- Entity Culling
- ImmediatelyFast
- Dynamic FPS
- Krypton
- Concurrent Chunk Management Engine, Fabric edition
- BadOptimizations
- More Culling
- Cull Leaves
- Particle Core
- Debugify
- Fast IP Ping
- FPS Reducer
- Dynamic View
- ServerCore
- Clumps
- Iris Shaders
- spark

Nothing in the list is a mystery binary. Every entry is a public Modrinth project ID that the launcher can resolve, download, verify, and record.

### Install Soul Client

1. Open Soul Launcher.
2. Go to **Home**.
3. Choose **New Space**.
4. Pick any compatible starting version; the Soul Client build will correct it.
5. In **Software**, choose **Soul Client**.
6. Pick **Soul Client 26.2**.
7. Optionally add more mods, resource packs, shaders, or datapacks.
8. Name the Space.
9. Choose **Create Space**.
10. Watch the new card download and prepare the client, then press **Play**.

The installer:

- Creates a normal Fabric Space named `Soul Client 26.2`.
- Installs Fabric Loader 0.19.5.
- Downloads all 24 public mods into that Space’s `mods` folder.
- Continues when an individual mod fails, then tells you which ones were missed.
- Leaves your other Spaces untouched.

Because it is a Space, you can duplicate it, export it, open its folder, pin it to the desktop, change its icon and color, or add shaders through the normal content browser.

## Making your own Soul Client build

The repository already contains the format the launcher understands. Use it when you prepare tomorrow’s client.

### Repository layout

```text
client/
  versions.json
  version-26.2/
    soul-client-26-2.zip
```

`versions.json` is the menu the launcher reads. Each zip contains a `soul-client.json` manifest at the zip root.

### versions.json

```json
{
  "versions": [
    {
      "id": "26.2",
      "name": "Soul Client 26.2",
      "mcVersion": "26.2",
      "loaderVersion": "0.19.5",
      "zip": "client/version-26.2/soul-client-26-2.zip",
      "modCount": 24,
      "released": "2026-09-10",
      "notes": "Tuned Fabric FPS build with 24 performance, stability, and options mods."
    }
  ]
}
```

Rules:

- `id` is the version shown in the launcher.
- `zip` must stay under `client/version-<id>/`.
- `loaderVersion` may be exact, such as `0.19.5`, or `"latest"`.
- Newest entries should go first.
- Keep the file small and valid; one malformed entry is skipped without hiding the others.

### soul-client.json

```json
{
  "name": "Soul Client",
  "version": "26.2",
  "mcVersion": "26.2",
  "loader": "fabric",
  "loaderVersion": "0.19.5",
  "description": "A tuned Fabric FPS build.",
  "ramGb": 4,
  "bundleIncluded": false,
  "mods": [
    {
      "source": "modrinth",
      "projectId": "sodium",
      "title": "Sodium"
    }
  ]
}
```

Rules:

- Only `"loader": "fabric"` is accepted.
- Only `"source": "modrinth"` is accepted.
- No more than 80 mods.
- `bundleIncluded: false` means the launcher downloads the listed public mods.
- `bundleIncluded: true` means the same zip already carries usable files.

### Manifest-only release

This is the recommended format for public Soul Client versions:

1. Put only `soul-client.json` in the zip.
2. List every public mod by Modrinth project ID.
3. Upload the small zip to `client/version-<id>/`.
4. Add the version to `client/versions.json`.

Advantages:

- Tiny repository history.
- Every mod remains publicly auditable.
- Users always get files compatible with the manifest’s Minecraft version.
- You can fix one bad mod by changing the manifest, not re-uploading jars.

### Fully bundled release

Use this only when you need files that cannot be fetched cleanly at install time:

1. Set `"bundleIncluded": true`.
2. Put mod jars under `mods/`.
3. Put configuration under `config/`.
4. Put resource packs under `resourcepacks/`.
5. Put shader packs under `shaderpacks/`.
6. Optionally include `options.txt` or `servers.dat` at the zip root.
7. Do not include absolute paths, `..` entries, executables, installers, launchers, or unrelated personal files.

The launcher rejects unsafe zip paths and only extracts those approved locations.

## Content browsing done carefully

Soul Launcher searches both Modrinth and CurseForge for:

- Mods
- Resource packs
- Shaders
- Data packs
- Modpacks

The important behavior is version honesty. If you ask for Minecraft 26.2, the launcher tries to install the newest file that actually supports Minecraft 26.2. It does not quietly substitute an incompatible latest file. When nothing compatible exists, it says so instead.

Results are plain rows with honest buttons: **Add** installs, **Remove** uninstalls — the button always says which, and picked rows carry an "In your Space" flag, so there is no icon-guessing. A refresh button reinstalls the newest compatible file.

Long result lists use numbered pages with **Prev / Next** buttons rendered both above and below the list, so you never scroll to the bottom to keep browsing. Pages replace results instead of appending forever.

The browser assumes failure: searches that fail show the error with a retry button and keep whatever was already visible. Offline, the New Space wizard still works from cached versions, typed versions, and latest-loader fallbacks instead of stranding you on an empty list.

## Single repository for app and live data

Releases, source code, live launcher data, and Soul Client builds all live here:

```text
serverlist.json
home/
  index.html
modpage.html
client/
  versions.json
  version-26.2/
    soul-client-26-2.zip
```

- `serverlist.json` feeds the Servers page and its offline cache.
- `home/index.html` hosts extra pages the launcher can display.
- `modpage.html` is a standalone Modrinth viewer kept for reference.
- `client/` contains every published Soul Client build.
- `docs/` is the official website (served by GitHub Pages) in the same visual theme as the app.

The GitHub Pages site serves the same files, so the launcher and the website never duplicate content in another repository.

### serverlist.json

```json
{
  "servers": [
    {
      "name": "Example SMP",
      "ip": "play.example.net",
      "port": 25565,
      "icon": "",
      "motd": "Short public description",
      "category": "SMP",
      "sponsored": false,
      "minVersion": "26.2"
    }
  ]
}
```

Keep this list short and trustworthy. The parser rejects malformed addresses, strips unsafe URLs, splits an embedded `host:port` correctly, and supports bracketed IPv6 addresses.

## Spaces, files, and everyday behavior

### Spaces

A Space folder contains the usual Minecraft instance layout plus launcher metadata. You can safely:

- Play different Minecraft versions side by side.
- Mix vanilla, Fabric, Quilt, Forge, NeoForge, OptiFine, and Soul Client builds.
- Add content later.
- Copy or rename Spaces through the launcher.
- Delete a Space without affecting other Spaces.

Exported Spaces use `.soulspace.json`. Older Orbit `.orbitspace.json` exports still import.

### Desktop shortcuts

Pinning a Space creates a shortcut named:

```text
Soul - <Space name>.lnk
```

Launching that shortcut starts Soul Launcher and plays the Space immediately. The shortcut remembers its exact path, so renaming a Space does not leave an unremovable shortcut behind. Duplicate Space names receive a short distinguishing tag rather than overwriting each other.

### Data location

Game data lives at:

```text
%APPDATA%\SoulLauncher
```

If you used Orbit Launcher, the first Soul start migrates the old data folder automatically instead of forcing you to redownload Minecraft.

Logs live under:

```text
%APPDATA%\SoulLauncher\logs\soul.log
```

Microsoft refresh tokens migrate from the old Windows Credential Manager service to the new Soul service. Old entries are removed after a successful migration.

## Categories and automatic sync

A **Category** is a group of Spaces that play together. Put your 1.21.1 Fabric Space and your 1.21.1 Forge Space in one category, add a server in-game on either one, and the other one has it too — no export, no copy-paste, no settings screen in the launcher. There is deliberately no manual "manage servers" UI: the game files themselves are the source of truth, and the launcher just keeps them pointed at the same place.

How it works, concretely:

- Each category owns one shared folder: `categories/<id>/shared/` holding a single `servers.dat` and a single `options.txt`.
- When a Space joins a category, its current files seed the shared folder if it is empty, then the Space's own `servers.dat` and `options.txt` are replaced with **OS symlinks** to the shared copies. Every member literally opens the same file, so an in-game change is instantly true for the whole group.
- Windows without symlink permission (no Developer Mode / admin) falls back to atomic copy-on-launch plus validated copy-back-on-exit: same result, one launch behind instead of instant.
- `servers.dat` is parsed as real gzipped NBT (`src-tauri/src/servers_dat.rs`), not copied blindly: corrupt writes are rejected before they can poison a whole category, and unknown per-server fields (icons, flags modpacks add) survive a rewrite.
- Leaving or deleting a category materializes symlinks back into standalone copies first, so nobody ever loses settings by ungrouping.

## Performance and resource use

Soul Launcher is intentionally boring in Task Manager:

- The UI is one lightweight native window.
- The Rust backend does downloads, installs, launching, pinging, and updates.
- Pages load in chunks, so navigation does not repeatedly reload heavy views.
- Background music and wallpapers are optional and can be disabled.
- Server pings are staggered, time-bounded, and cancellable.
- Large installs stream to disk instead of accumulating unbounded memory.
- Installer downloads use retries and stall detection rather than hanging forever.

For Minecraft itself, use **Settings > Performance**:

- Scan your hardware.
- Choose Balanced or Performance.
- Let the launcher recommend memory.
- Apply the preset automatically or only when you want it.
- Keep advanced JVM arguments alone unless you understand them.

For Soul Client specifically, 4 GB is a sensible starting point on a 16 GB machine. Do not assign most of your system memory to Minecraft; unused RAM does not make Java faster and can make garbage collection worse.

## Microsoft sign-in

Soul Launcher supports:

- Microsoft accounts
- Offline accounts
- Skin preview and upload
- Cape selection for eligible Microsoft accounts

The Microsoft authentication window may display **OpenLauncher**. That is expected: Soul Launcher descends from OpenLauncher and uses its official authentication service. Your Microsoft credentials are entered in Microsoft’s own sign-in flow, not in a Soul Launcher password field.

## Download

Get `SoulLauncher-Setup.exe` from the [v1.0.0-beta release page](https://github.com/unmid/SoulLauncher/releases/tag/v1.0.0-beta), or browse [all releases](https://github.com/unmid/SoulLauncher/releases).

After the first install, Soul Launcher updates itself automatically. You do not need to download future installers manually.

### Windows SmartScreen on the beta

Windows will very likely greet the installer with "Windows protected your PC" and an unknown-publisher warning. That is SmartScreen doing its job, not a diagnosis: the beta is not code-signed with a paid certificate yet, so Windows has no reputation to check against. The installer is built in the open — [the release workflow](.github/workflows/release.yml) compiles it straight from the source in this repository, and you can verify that yourself by building from source below.

To install anyway: click **More info**, then **Run anyway**. If that bothers you (fair enough), skip the download and build it yourself — same bytes, your machine, nobody to trust. If actual Windows Defender (not SmartScreen) flags the file, please file an issue with the exact message and your Windows version.

## Building from source

You need:

- Node.js 22 or newer
- Rust stable
- The normal Tauri 2 prerequisites for Windows

Frontend and tests:

```bash
npm ci
npm run build
cargo test --workspace
```

Full local installer:

```bash
npm run tauri build
```

Development mode:

```bash
npm run tauri dev
```

The workspace shares one version in the root `Cargo.toml`. The same version appears in `package.json` and `src-tauri/tauri.conf.json`.

Public clones build without private tokens. Features that need a GitHub or CurseForge key degrade gracefully instead of failing the whole build.

## Releases

Windows releases are produced from `v*` tags by `.github/workflows/release.yml`. A release publishes:

- The NSIS installer.
- Signed Tauri updater artifacts.
- `latest.json`.
- Release notes.

Installed copies verify update signatures before installing anything. The signing public key is embedded in the app. Keep the private key out of git; it belongs in GitHub Actions secrets and local build secrets only.

Automated releases need a `TAURI_SIGNING_PRIVATE_KEY` repository secret (plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if your key has one). Without it, the release workflow fails at the signing step — beta installers can still be attached to a release by hand in the meantime.

## Project structure

```text
Cargo.toml            # workspace root and shared version
package.json          # React 19 + Vite frontend
src/                  # pages, components, icons, styles
public/               # fonts, icons, logo, wallpapers, music
src-tauri/            # Rust backend: install, launch, accounts, content
serverlist.json       # live server list for the Servers page
docs/                 # official website (GitHub Pages)
home/                 # extra hosted pages
modpage.html          # standalone Modrinth viewer (reference)
client/               # published Soul Client builds
```

## How the code fits together

If you want to learn from (or hack on) this codebase, here is the honest map. Backend first — every item is a Tauri command or the module behind one:

- **`main.rs`** is the command registry and not much else: settings, spaces CRUD, categories, content, accounts, storage, updates, launching. Start here to see what the frontend is allowed to ask for.
- **`launch.rs` (`prepare_and_launch`)** is the heart of the app: resolve loader → fetch Mojang version data → download client, libraries, natives, assets in parallel → ensure Java → apply category sync last → spawn the game. Progress is throttled to ~150 ms so the UI stays smooth.
- **`categories.rs`** owns group sync: `ensure_category_links` (symlink or copy fallback), `push_shared_into_space` before launch, `pull_space_into_shared` after exit, `seed_shared_from_space` for first join, `detach_space` for clean leaving.
- **`servers_dat.rs`** is the real NBT layer: generic tag reader/writer, gzip handling, `read/write_servers_dat` with validation and unknown-field preservation, `read/write_options_txt`, and the `link_or_copy` / `is_linked_to` symlink helpers.
- **`loaders.rs`** installs Fabric, Quilt, Forge, NeoForge, and OptiFine (including driving the official OptiFine installer with Java when needed).
- **`mojang.rs`** talks to Mojang's APIs: version manifest, inheritance resolution, libraries, assets, launch arguments.
- **`download.rs`** downloads with per-chunk stall timeouts and retries, so a dead connection fails loudly instead of hanging on "Getting ready" forever.
- **`content.rs`** searches and installs from Modrinth and CurseForge with version honesty: newest file that supports your exact version or a clear error. CurseForge needs an API key, so it compiles to empty without `SOUL_CF_KEY` and degrades instead of breaking the build.
- **`modpack.rs`** turns `.mrpack` / CurseForge zips into install plans, rejects unsafe paths, and sniffs local `.jar` / `.zip` kinds.
- **`soulclient.rs`** installs the repo's own client builds from `client/versions.json`.
- **`accounts.rs`** handles offline UUIDs, Microsoft login/refresh, and Windows Credential Manager storage with migration from Orbit's entries.
- **`servers.rs`** is the Server List Ping implementation (handshake, status, latency) plus strict parsing of this repo's `serverlist.json`.
- **`hardware.rs` / `jruntime.rs` / `storage.rs` / `profile.rs` / `remote.rs` / `update.rs` / `store.rs` / `spaces.rs`** cover optimization presets, Java runtimes, junk cleanup, skins/capes, fetching, the updater, settings, and Space/category persistence respectively.

Frontend (`src/`), same idea:

- **`App.jsx`** is the shell: side nav, frameless title bar, theme/music/launch state, toasts, auto-updater, desktop-shortcut `--space` launches.
- **`HomePage.jsx`** is intentionally almost empty: wallpaper plus the launch dock (Space picker + Play).
- **`LibraryPage.jsx`** is Spaces plus drag-and-drop categories. **`SpaceCard.jsx`** is one Space: play, progress, and the options menu.
- **`SpaceWizard.jsx`** is the 4-step New/Edit popup, built to survive offline (cached versions, manual typing, latest-loader fallback).
- **`ModsBrowser.jsx`** is content search with real pagination (Prev/Next, top and bottom) and unambiguous Add/Remove buttons.
- **`ServersPage.jsx`** pings the repo's server list live, with cache-then-popular-servers fallbacks.
- **`AccountPage.jsx`** covers accounts, 3D skin preview, uploads, and cape cards. **`SettingsPage.jsx`** covers appearance, performance, storage, updates, logs.
- **`api.js`** is the single Tauri bridge with web-preview fallbacks, so `npm run dev` renders without the backend. **`Dropdown.jsx`** is a portal menu that positions against the viewport and never gets clipped. **`icons.jsx`** wires Lucide for app icons and keeps loader logos and block art as images. **`styles.css`** is the whole design system: soft-black dark theme, a real light theme, pill shapes, and transform-only motion.

## Troubleshooting

### A Soul Client build will not install

Check:

1. Your internet connection.
2. Whether that version is listed in `client/versions.json`.
3. Whether its zip is actually present in the repository.
4. The launcher logs under Settings.
5. Whether an individual Modrinth project temporarily removed its 26.2 file.

The installer reports skipped mods rather than failing silently.

### The Servers page says offline

Soul Launcher saves the last good server list. If the live list cannot be reached, it shows the cached list and marks the page offline. Individual failed pings have a retry button. Refresh rechecks both the list and every visible server.

### Content search fails or shows nothing

The browser shows the error inline with a retry button and keeps old results on screen. Check your connection, try **All versions** (some projects never tag snapshots), or add a local `.jar` / `.zip` with **Add file** instead.

### Music or wallpapers are distracting

Disable them under **Settings > Appearance**. Disabling animations makes navigation nearly instant and reduces visual noise.

## Beta and feedback

This is a beta: expect bugs, and please report them instead of working around them in silence. A useful report has four things:

1. The launcher version (Settings shows it, or name the release tag).
2. What you clicked and what you expected.
3. The exact error text, if any.
4. The tail of `%APPDATA%\SoulLauncher\logs\soul.log` (Settings > Logs shows it in-app).

File it at [github.com/unmid/SoulLauncher/issues](https://github.com/unmid/SoulLauncher/issues). Crash? Tell us whether the window closed, froze, or showed a toast — those are three different bugs with three different fixes.

## Website

The official page lives in [`docs/`](docs/) in this repository and is published with GitHub Pages: same dark slate and teal theme as the app, download button, feature tour, and a live preview of `serverlist.json`. To enable it on a fork: repository Settings > Pages > Deploy from branch > `main` + `/docs`.

## License

GPL-3.0-only. See `LICENSE`.
