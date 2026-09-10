import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { api, avatarUrl } from './api.js'
import { IconMusic, IconPlay, AppIcon, IconSun, IconMoon } from './icons.jsx'

// Each page lives in its own chunk; they're all prefetched right after the
// first paint, so switching pages later is instant and seamless.
const HomePage = lazy(() => import('./HomePage.jsx'))
const LibraryPage = lazy(() => import('./LibraryPage.jsx'))
const ServersPage = lazy(() => import('./ServersPage.jsx'))
const AccountPage = lazy(() => import('./AccountPage.jsx'))
const SettingsPage = lazy(() => import('./SettingsPage.jsx'))
const SpaceWizard = lazy(() => import('./SpaceWizard.jsx'))

const NAV = [
  { section: 'Play' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'library', label: 'Library', icon: 'grid' },
  { id: 'servers', label: 'Servers', icon: 'list' },
  { section: 'You' },
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
]

const PAGE_TITLES = {
  home: 'Home',
  library: 'Library',
  servers: 'Servers',
  account: 'Account',
  settings: 'Settings',
}

// Music tracks are discovered automatically: vite.config.js scans
// public/musics and writes musics-manifest.json (dev + every build), so any
// audio file dropped in the folder is picked up. Fallback keeps web previews
// working if the manifest is missing.
const FALLBACK_MUSIC = ['Soft Reset.mp3']
async function loadMusicList() {
  try {
    const r = await fetch('./musics-manifest.json')
    if (r.ok) {
      const data = await r.json()
      if (Array.isArray(data.files) && data.files.length) return data.files
    }
  } catch {}
  return FALLBACK_MUSIC
}
const BROWSER_SETTINGS = {
  ramGb: 4, closeOnPlay: true,
  extraJvmArgs: '', activeAccountId: null, theme: 'dark', accent: '#f26a3c',
  music: false, musicVolume: 0.35, animations: true, wallpapers: true, optimizeMode: 'off',
  optimizeAuto: false, optimizeRenderDistance: 10, selectedSpaceId: null,
}
const DESKTOP_RUNTIME = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)

const PALE_ACCENTS = ['#f26a3c', '#3ea1d9', '#eeb64d', '#ef8fa5', '#71b06c', '#8d7ae0', '#e0503a', '#4fc4b5']

export default function App() {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(null)
  const [spaces, setSpaces] = useState([])
  const [accounts, setAccounts] = useState([])
  const [page, setPage] = useState('home')
  const [progress, setProgress] = useState({})
  const [wizardState, setWizardState] = useState(null)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)
  const musicRef = useRef(null)
  const musicListRef = useRef(FALLBACK_MUSIC)
  const musicQueueRef = useRef([])
  const lastTrackRef = useRef(null)
  const [nowPlaying, setNowPlaying] = useState('')
  const speedRef = useRef({})

  const notify = useCallback((message, kind = 'ok') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message: String(message).slice(0, 220), kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const refreshSpaces = useCallback(async () => {
    try { setSpaces(await api.listSpaces()) } catch (e) { console.error(e) }
  }, [])

  const refreshAccounts = useCallback(async () => {
    try { setAccounts(await api.listAccounts()) } catch (e) { console.error(e) }
  }, [])

  const refreshSettings = useCallback(async () => {
    try { setSettings(await api.getSettings()) } catch (e) { console.error(e) }
  }, [])

  // Pages can carry a sub-target: 'settings:updates' opens Settings on a tab.
  const navigate = useCallback((to) => {
    const [pageId, sub] = String(to).split(':')
    setPage(pageId)
    if (sub) setTimeout(() => window.dispatchEvent(new CustomEvent('soul-subnav', { detail: sub })), 0)
  }, [])

  // Pages can request navigation (home banners, empty states).
  useEffect(() => {
    const onNav = (e) => { if (e.detail) navigate(e.detail) }
    window.addEventListener('soul-nav', onNav)
    return () => window.removeEventListener('soul-nav', onNav)
  }, [navigate])

  // ---- initial load ------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.getSettings()
        setSettings(s)
        loadMusicList().then((list) => { musicListRef.current = list }).catch(() => {})
        await Promise.all([refreshSpaces(), refreshAccounts()])
      } catch (e) {
        // The Vite preview has no Tauri bridge. Keep it useful for visual QA
        // and web previews without changing the desktop default behaviour.
        setSettings(BROWSER_SETTINGS)
        if (DESKTOP_RUNTIME) notify('Something went wrong starting up: ' + e, 'error')
      } finally {
        setReady(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch every page chunk as soon as the shell is ready. Each page still
  // lives in its own module, but navigation no longer flashes a loading view.
  useEffect(() => {
    if (!ready) return
    import('./HomePage.jsx')
    import('./LibraryPage.jsx')
    import('./ServersPage.jsx')
    import('./AccountPage.jsx')
    import('./SettingsPage.jsx')
    import('./SpaceWizard.jsx')
    import('./ModsBrowser.jsx')
  }, [ready])

  // ---- automatic updates ---------------------------------------------------
  // Releases are published to GitHub as version tags; the updater applies the
  // latest release in place so users never reinstall the app manually.
  useEffect(() => {
    if (!ready || !DESKTOP_RUNTIME) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (!update || cancelled) return
        notify(`Update available — downloading Soul Launcher v${update.version}…`)
        await update.downloadAndInstall()
        if (cancelled) return
        notify(`Updated to v${update.version} — restarting Soul Launcher…`)
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      } catch { /* offline, dev build or unsigned bundle — stay silent */ }
    })()
    return () => { cancelled = true }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop shortcuts (`Soul - <name>.lnk`) start the app with `--space <id>`:
  // select that Space and launch it immediately, skipping manual selection.
  const autoLaunchRef = useRef(false)
  useEffect(() => {
    if (!ready || !DESKTOP_RUNTIME || autoLaunchRef.current) return
    autoLaunchRef.current = true
    api.launchArgs().then((args) => {
      const i = args.indexOf('--space')
      const id = i >= 0 ? args[i + 1] : null
      if (!id) return
      const space = spaces.find((s) => s.id === id)
      if (space) {
        selectSpace(id)
        play(space)
      }
    }).catch(() => {})
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- theming -----------------------------------------------------------
  useEffect(() => {
    if (!settings) return
    const accent = settings.accent || '#f26a3c'
    if (!PALE_ACCENTS.includes(accent)) {
      // migrate old accents to the current palette (closest by hue distance in hex)
      const migrated = migrateAccent(accent)
      document.documentElement.style.setProperty('--accent', migrated.hex)
      document.documentElement.style.setProperty('--accent-ink', migrated.ink)
    } else {
      document.documentElement.style.setProperty('--accent', accent)
      document.documentElement.style.setProperty('--accent-ink', accentInk(accent))
    }
    document.documentElement.classList.toggle('no-anim', settings.animations === false)
    document.body.dataset.theme = settings.theme === 'light' ? 'light' : 'dark'
  }, [settings?.accent, settings?.animations, settings?.theme, settings])

  // ---- music ---------------------------------------------------------------
  // A rotating station, not a single looping track: tracks are shuffled, and
  // when one ends the player crossfades into another random track.
  const musicVolume = () => {
    const v = Number(settings?.music_volume)
    return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.35
  }

  useEffect(() => {
    if (!settings) return
    if (settings.music === false) {
      stopMusic()
      return
    }
    if (!musicRef.current) startMusic()
  }, [settings?.music]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live volume slider — retarget whatever is playing right now.
  useEffect(() => {
    if (musicRef.current && settings?.music !== false) fade(musicRef.current, musicVolume(), 300)
  }, [settings?.music_volume]) // eslint-disable-line react-hooks/exhaustive-deps

  function shuffled(list) {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  function refillQueue() {
    let list = shuffled(musicListRef.current.length ? musicListRef.current : FALLBACK_MUSIC)
    // Avoid hearing the same track twice back-to-back when possible.
    if (list.length > 1 && lastTrackRef.current && list[0] === lastTrackRef.current) {
      ;[list[0], list[list.length - 1]] = [list[list.length - 1], list[0]]
    }
    musicQueueRef.current = list
  }
  function startMusic() {
    if (musicRef.current) return
    refillQueue()
    playNext()
  }
  function playNext() {
    if (!musicQueueRef.current.length) refillQueue()
    const file = musicQueueRef.current.shift()
    lastTrackRef.current = file
    const audio = new Audio(`./musics/${encodeURIComponent(file)}`)
    audio.volume = 0
    audio.onended = () => { if (musicRef.current === audio) playNext() }
    audio.play().catch(() => {})
    fade(audio, musicVolume(), 1200)
    setNowPlaying(file.replace(/\.[^.]+$/, ''))
    const prev = musicRef.current
    if (prev) fade(prev, 0, 700, () => { prev.onended = null; prev.pause(); prev.src = '' })
    musicRef.current = audio
  }
  function skipMusic() {
    if (!settings || settings.music === false) return
    playNext()
  }
  function stopMusic() {
    const a = musicRef.current
    if (!a) return
    a.onended = null
    musicRef.current = null
    fade(a, 0, 600, () => { a.pause(); a.src = '' })
  }
  function duckMusic() {
    if (musicRef.current) fade(musicRef.current, 0, 500)
  }
  function unduckMusic() {
    if (musicRef.current && settings?.music !== false) fade(musicRef.current, musicVolume(), 1000)
  }
  function fade(a, target, ms, done) {
    const start = a.volume
    const t0 = performance.now()
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms)
      a.volume = Math.max(0, Math.min(1, start + (target - start) * k))
      if (k < 1) requestAnimationFrame(tick)
      else done?.()
    }
    requestAnimationFrame(tick)
  }
  const musicCtl = useRef({ duck: duckMusic, unduck: unduckMusic })
  musicCtl.current = { duck: duckMusic, unduck: unduckMusic }

  // ---- launch progress -----------------------------------------------------
  useEffect(() => {
    let unlisten = null
    Promise.resolve(api.onProgress((p) => {
      // live download metrics: bytes/sec + seconds remaining
      if (p.stage === 'files' && p.total > 0) {
        const now = performance.now()
        const last = speedRef.current[p.spaceId]
        if (last && now - last.t > 250) {
          const bps = Math.max(0, (p.done - last.done) / ((now - last.t) / 1000))
          p = { ...p, speedBps: bps, etaSec: bps > 0 ? (p.total - p.done) / bps : null }
        } else if (last?.speedBps != null) {
          p = { ...p, speedBps: last.speedBps, etaSec: last.etaSec }
        }
        speedRef.current[p.spaceId] = { t: now, done: p.done, speedBps: p.speedBps, etaSec: p.etaSec }
      }
      if (p.stage === 'log') return
      if (p.stage === 'ready') {
        // A modpack finished installing in the background.
        delete speedRef.current[p.spaceId]
        setProgress((prev) => {
          const copy = { ...prev }
          delete copy[p.spaceId]
          return copy
        })
        notify(p.message || 'Space is ready', 'ok')
        refreshSpaces()
        return
      }
      setProgress((prev) => {
        const next = { ...prev }
        if (p.stage === 'running') {
          // Keep a short success state so people see that Minecraft really started.
          next[p.spaceId] = p
          delete speedRef.current[p.spaceId]
          setTimeout(() => {
            setProgress((cur) => {
              if (cur[p.spaceId]?.stage !== 'running') return cur
              const copy = { ...cur }
              delete copy[p.spaceId]
              return copy
            })
          }, 1800)
          return next
        }
        next[p.spaceId] = p
        if (p.stage === 'error' || p.stage === 'stopped') {
          delete speedRef.current[p.spaceId]
          setTimeout(() => {
            setProgress((cur) => {
              if (cur[p.spaceId]?.stage === p.stage) {
                const copy = { ...cur }
                delete copy[p.spaceId]
                return copy
              }
              return cur
            })
          }, p.stage === 'error' ? 5000 : 1200)
        }
        return next
      })
      if (p.stage === 'error') notify(p.message, 'error')
      if (p.stage === 'running') {
        notify('Game started — good luck!', 'ok')
        musicCtl.current.duck()
        refreshSpaces()
        if (settings?.closeOnPlay !== false) {
          import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().hide()).catch(() => {})
        }
      }
      if (p.stage === 'stopped') {
        musicCtl.current.unduck()
        refreshSpaces()
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().show().then(() => getCurrentWindow().setFocus())).catch(() => {})
      }
    })).then((u) => { unlisten = u }).catch(() => {})
    return () => { if (unlisten) unlisten() }
  }, [notify, refreshSpaces, settings?.closeOnPlay])

  // validate the active microsoft account once
  useEffect(() => {
    const active = accounts.find((a) => a.id === settings?.activeAccountId)
    if (active && active.kind === 'microsoft') {
      api.validateAccount(active.id).then((st) => {
        if (!st.ok) notify('Sign-in check: ' + st.message, 'error')
      }).catch(() => {})
    }
  }, [accounts, settings?.activeAccountId, notify])

  const activeAccount = accounts.find((a) => a.id === settings?.activeAccountId) || accounts[0]
  const selectedSpace = spaces.find((s) => s.id === settings?.selectedSpaceId) || spaces[0] || null
  const play = async (space, server = null) => {
    if (!activeAccount) {
      setPage('account')
      notify('Add an account first — it takes 10 seconds!', 'error')
      return
    }
    setProgress((prev) => ({
      ...prev,
      [space.id]: { spaceId: space.id, stage: 'launching', message: 'Warming up…', done: 0, total: 0 },
    }))
    try {
      await api.launchSpace(space.id, server)
    } catch (e) {
      setProgress((prev) => {
        const copy = { ...prev }
        delete copy[space.id]
        return copy
      })
      notify(String(e), 'error')
    }
  }

  const saveSettings = async (s) => {
    setSettings(s)
    try { await api.saveSettings(s) } catch (e) { notify(String(e), 'error') }
  }

  const toggleTheme = () => {
    saveSettings({ ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' })
  }
  const toggleMusic = () => {
    saveSettings({ ...settings, music: settings.music === false ? true : false })
  }

  const selectSpace = async (id) => {
    const s = { ...settings, selectedSpaceId: id }
    saveSettings(s)
  }

  // A modpack just became a new Space — select it so the user lands on it.
  const onSpaceCreated = useCallback((spaceId) => {
    refreshSpaces()
    if (spaceId) selectSpace(spaceId)
    setWizardState(null)
  }, [refreshSpaces, selectSpace]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="boot" />

  const pageProps = {
    settings, spaces, accounts, activeAccount, progress,
    play, notify, refreshSpaces, refreshAccounts, refreshSettings,
    saveSettings, navigate, openWizard: setWizardState, selectSpace,
  }

  return (
    <div className="app">
      <aside className="sidenav">
        <div className="sidenav-brand" onClick={() => navigate('home')} title="Soul Launcher">
          <span className="brand-badge"><img src="./icons/logo.png" width="26" height="26" alt="Orbit" draggable={false} /></span>
          <span className="brand-word">Soul</span>
        </div>
        <nav className="sidenav-nav">
          {NAV.map((item, i) => item.section ? (
            <div key={`s${i}`} className="nav-section">{item.section}</div>
          ) : (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <span className="nav-ic"><AppIcon name={item.icon} size={19} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidenav-foot">
          {settings.music !== false && nowPlaying && (
            <div className="now-playing" title={nowPlaying}>
              <IconMusic size={14} />
              <span className="now-playing-name">{nowPlaying}</span>
              <button className="np-skip" onClick={skipMusic} title="Next track">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8V4zm12 0h3v16h-3z" /></svg>
              </button>
            </div>
          )}
          <div className="sidenav-mini-actions">
            <button
              className="mini-action"
              onClick={toggleTheme}
              title={settings.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {settings.theme === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
              <span>{settings.theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
            <button
              className={`mini-action ${settings.music === false ? '' : 'on'}`}
              onClick={toggleMusic}
              title="Background music"
            >
              <IconMusic size={15} />
              <span>Music</span>
            </button>
          </div>
          <button className="sidenav-account" onClick={() => navigate('account')} title="Accounts">
            {activeAccount ? (
              <>
                <img src={avatarUrl(activeAccount.username, 60)} alt="" draggable={false} />
                <span className="sa-text" style={{ flex: 1, minWidth: 0 }}>
                  <span className="sa-name">{activeAccount.username}</span>
                  <span className="sa-sub">{activeAccount.kind === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
                </span>
              </>
            ) : (
              <>
                <img src="./icons/app/user.png" width={30} height={30} alt="" draggable={false} />
                <span className="sa-text" style={{ flex: 1, minWidth: 0 }}>
                  <span className="sa-name">Add account</span>
                  <span className="sa-sub">Required to play</span>
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="main-col">
        <TitleBar title={PAGE_TITLES[page] || 'Soul'} />

        <main className="page-wrap">
          <Suspense fallback={<div className="page-loading"><span className="mini-spinner" /></div>}>
            {page === 'home' && <HomePage {...pageProps} selectedSpace={selectedSpace} />}
            {page === 'library' && <LibraryPage {...pageProps} />}
            {page === 'servers' && <ServersPage {...pageProps} />}
            {page === 'account' && <AccountPage {...pageProps} />}
            {page === 'settings' && <SettingsPage {...pageProps} />}
          </Suspense>
        </main>
      </div>

      {wizardState && (
        <Suspense fallback={null}>
          <SpaceWizard
            existing={wizardState === 'new' ? null : wizardState}
            settings={settings}
            onClose={() => setWizardState(null)}
            onSaved={refreshSpaces}
            onSpaceCreated={onSpaceCreated}
            notify={notify}
          />
        </Suspense>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </div>
  )
}

/* Frameless window titlebar: drag region + min / max / close. */
function TitleBar({ title }) {
  const winRef = useRef(null)
  const [maximized, setMaximized] = useState(false)

  const win = async () => {
    if (!DESKTOP_RUNTIME) return null
    if (!winRef.current) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      winRef.current = getCurrentWindow()
    }
    return winRef.current
  }

  useEffect(() => {
    let unlisten = null
    win().then(async (w) => {
      if (!w) return
      setMaximized(await w.isMaximized().catch(() => false))
      unlisten = await w.onResized(() => w.isMaximized().then(setMaximized).catch(() => {}))
    }).catch(() => {})
    return () => { if (unlisten) unlisten() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMax = async () => { const w = await win(); if (w) w.toggleMaximize().catch(() => {}) }
  const minimize = async () => { const w = await win(); if (w) w.minimize().catch(() => {}) }
  const close = async () => { const w = await win(); if (w) w.close().catch(() => {}) }

  return (
    <header className="titlebar">
      <span className="titlebar-title">
        <IconPlay size={12} style={{ color: 'var(--accent)' }} />
        {title}
      </span>
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={toggleMax}
      />
      <div className="win-controls">
        <button className="win-btn" onClick={minimize} title="Minimize" aria-label="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
        <button className="win-btn" onClick={toggleMax} title={maximized ? 'Restore' : 'Maximize'} aria-label="Maximize">
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3.2" y="1.2" width="7.6" height="7.6" rx="1.5" /><path d="M1.2 9V4.4c0-1 .8-1.8 1.8-1.8h1" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" /></svg>
          )}
        </button>
        <button className="win-btn win-close" onClick={close} title="Close" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      </div>
    </header>
  )
}

function accentInk(hex) {
  // dark ink on light colors, white on dark ones
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#2b2320' : '#ffffff'
}

function migrateAccent(old) {
  const table = {
    '#5ac8fa': '#3ea1d9', '#7d7aff': '#8d7ae0', '#ff6482': '#ef8fa5', '#30d158': '#71b06c',
    '#ffd60a': '#eeb64d', '#ff9f0a': '#f26a3c', '#bf5af2': '#8d7ae0', '#64d2ff': '#3ea1d9',
  }
  const hex = table[old] || '#f26a3c'
  return { hex, ink: accentInk(hex) }
}

function fmtMb(bytes) {
  return (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)
}

function fmtEta(sec) {
  if (sec == null) return ''
  if (sec < 2) return 'almost done'
  if (sec < 90) return `~${Math.ceil(sec)}s left`
  return `~${Math.ceil(sec / 60)}min left`
}

export function progressDetail(p) {
  if (!p) return ''
  if (p.stage === 'running') return 'Minecraft is open and ready to play'
  if (p.stage === 'files' && p.total > 0) {
    let s = `${fmtMb(p.done)} / ${fmtMb(p.total)} MB`
    if (p.speedBps) s += `  ·  ${fmtMb(p.speedBps)} MB/s`
    if (p.etaSec != null && p.stage === 'files') s += `  ·  ${fmtEta(p.etaSec)}`
    return s
  }
  return p.message || ''
}

export function stageText(p) {
  if (!p) return 'Preparing…'
  switch (p.stage) {
    case 'loader': return 'Setting up the game…'
    case 'java': return 'Getting Java ready…'
    case 'launching': return 'Launching Minecraft…'
    case 'version': return 'Reading version info…'
    case 'files': return 'Downloading game files'
    case 'running': return 'Minecraft is running'
    default: return p.message || 'Working…'
  }
}
