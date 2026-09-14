import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtBytes } from './api.js'
import {
  IconBrush, IconMusic, IconSparkle, IconLayers, IconGear, IconTrash, IconDisk, IconShield,
  IconSun, IconMoon, IconBolt, IconCpu, IconGpu, IconRam, IconCheck, IconUpdate, IconExternal,
  IconInfo, IconGithub, IconDiscord, IconRefresh, IconSearch, IconDownload,
} from './icons.jsx'

const ACCENTS = [
  ['#5eead4', 'Engine'], ['#38bdf8', 'Sky'], ['#fbbf24', 'Honey'], ['#fb7185', 'Rose'],
  ['#34d399', 'Leaf'], ['#a78bfa', 'Iris'], ['#f87171', 'Crimson'], ['#2dd4bf', 'Lagoon'],
]

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: IconBrush },
  { id: 'performance', label: 'Performance', icon: IconBolt },
  { id: 'storage', label: 'Storage', icon: IconDisk },
  { id: 'updates', label: 'Updates', icon: IconUpdate },
  { id: 'logs', label: 'Logs', icon: IconCpu },
]

function Toggle({ title, sub, value, onChange, icon: Icon }) {
  return (
    <div className="opt-toggle-row">
      <div className="toggle-left">
        {Icon && <Icon size={16} />}
        <div>
          <div className="toggle-title">{title}</div>
          {sub && <div className="toggle-sub">{sub}</div>}
        </div>
      </div>
      <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={!!value}>
        <span className="switch-knob" />
      </button>
    </div>
  )
}

/* ---- Appearance ----------------------------------------------------------- */

function AppearanceTab({ settings, saveSettings }) {
  const set = (patch) => saveSettings({ ...settings, ...patch })
  const theme = settings.theme === 'light' ? 'light' : 'dark'

  return (
    <>
      <section className="settings-card">
        <div className="settings-card-title"><IconBrush size={16} /> Look &amp; feel</div>
        <div className="field">
          <label className="field-label">Theme</label>
          <div className="segment">
            <button className={`segment-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => set({ theme: 'light' })}>
              <IconSun size={14} /> Light
            </button>
            <button className={`segment-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => set({ theme: 'dark' })}>
              <IconMoon size={14} /> Dark
            </button>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Accent color</label>
          <div className="color-row">
            {ACCENTS.map(([c, name]) => (
              <button key={c} className={`color-dot ${settings.accent === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => set({ accent: c })} title={name} />
            ))}
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-title"><IconSparkle size={16} /> Atmosphere</div>
        <Toggle title="Home wallpapers" sub="A slow, cinematic slideshow behind the Home screen" value={settings.wallpapers !== false} onChange={(v) => set({ wallpapers: v })} icon={IconLayers} />
        <Toggle title="Animations" sub="Turn off for a plain, instant UI" value={settings.animations !== false} onChange={(v) => set({ animations: v })} icon={IconSparkle} />
        <Toggle title="Background music" sub="A rotating station from your musics folder (quietens while you play)" value={settings.music !== false} onChange={(v) => set({ music: v })} icon={IconMusic} />
        <div className="opt-toggle-row">
          <div className="toggle-left">
            <IconMusic size={16} />
            <div>
              <div className="toggle-title">Music volume</div>
              <div className="toggle-sub">{Math.round((settings.music_volume ?? 0.35) * 100)}%</div>
            </div>
          </div>
          <input
            type="range" min="0" max="100" step="5"
            value={Math.round((settings.music_volume ?? 0.35) * 100)}
            onChange={(e) => set({ music_volume: Number(e.target.value) / 100 })}
            className="volume-slider"
            style={{ '--fill': `${Math.round((settings.music_volume ?? 0.35) * 100)}%` }}
            aria-label="Music volume"
          />
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-title"><IconGear size={16} /> Behavior</div>
        <Toggle title="Hide launcher while playing" sub="Soul minimizes when the game starts and comes back when you quit" value={settings.closeOnPlay !== false} onChange={(v) => set({ closeOnPlay: v })} icon={IconGear} />
      </section>
    </>
  )
}

/* ---- Performance (was the Optimize page) ------------------------------------- */

const PRESETS = [
  {
    id: 'balanced',
    name: 'Balanced',
    icon: IconSparkle,
    desc: 'Smooth play with good graphics. Sane JVM flags, moderate render distance.',
    tags: ['Stable', 'Pretty', 'Everyday'],
  },
  {
    id: 'performance',
    name: 'Performance',
    icon: IconBolt,
    desc: 'Max FPS. Aggressive GC tuning, lower render distance, fast graphics in options.txt.',
    tags: ['FPS first', 'Low-end friend', 'Competitive'],
  },
]

function PerformanceTab({ settings, saveSettings, notify }) {
  const [hw, setHw] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [recommended, setRecommended] = useState(null)
  const [advanced, setAdvanced] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const info = await api.hardwareScan()
      if (info) {
        setHw(info)
        setRecommended(await api.recommendedRam(info.ramTotalGb))
      }
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setScanning(false)
    }
  }, [notify])

  useEffect(() => { scan() }, [scan])

  const mode = settings.optimizeMode || 'off'
  const setMode = (m) => {
    saveSettings({ ...settings, optimizeMode: m })
    notify(m === 'off' ? 'Optimization off' : `${m === 'balanced' ? 'Balanced' : 'Performance'} preset saved`)
  }

  const ramGb = settings.ramGb || 4
  const renderDist = settings.optimizeRenderDistance || 10

  return (
    <>
      <section className="settings-card">
        <div className="optimize-scan-row">
          <div style={{ minWidth: 0 }}>
            <div className="settings-card-title" style={{ marginBottom: 8 }}><IconCpu size={16} /> Your hardware</div>
            {hw ? (
              <div className="hw-grid">
                <div className="hw-item"><IconCpu size={17} /><div><div className="hw-label">CPU</div><div className="hw-value">{hw.cpuName} · {hw.cpuCores} cores</div></div></div>
                <div className="hw-item"><IconRam size={17} /><div><div className="hw-label">RAM</div><div className="hw-value">{Number(hw.ramTotalGb).toFixed(0)} GB · recommended {recommended ?? '…'} GB for Minecraft</div></div></div>
                <div className="hw-item"><IconGpu size={17} /><div><div className="hw-label">GPU</div><div className="hw-value">{hw.gpuName}</div></div></div>
              </div>
            ) : (
              <div className="hw-grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="hw-item">
                    <div className="skeleton" style={{ width: 18, height: 18, borderRadius: 5 }} />
                    <div style={{ flex: 1, maxWidth: 320 }}>
                      <div className="skeleton skeleton-line" style={{ width: '30%' }} />
                      <div className="skeleton skeleton-line" style={{ width: '82%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-secondary" onClick={scan} disabled={scanning} style={{ flex: 'none' }}>
            {scanning ? <span className="mini-spinner" /> : <IconRefresh size={15} />} {hw ? 'Scan again' : 'Scan'}
          </button>
        </div>
      </section>

      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset-card ${mode === p.id ? 'selected' : ''}`} onClick={() => setMode(mode === p.id ? 'off' : p.id)}>
            <p.icon size={24} />
            <span className="preset-name">{p.name}</span>
            <span className="preset-desc">{p.desc}</span>
            <span className="preset-tags">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>
            {mode === p.id && <span className="preset-check"><IconCheck size={13} /> Active</span>}
          </button>
        ))}
      </div>

      <section className="settings-card">
        <Toggle
          title="Apply automatically"
          sub="Re-apply the preset to every Space right before launch."
          value={!!settings.optimizeAuto}
          onChange={(v) => saveSettings({ ...settings, optimizeAuto: v })}
          icon={IconBolt}
        />
        <div className="preset-note">
          {mode === 'off'
            ? 'No preset selected — pick Balanced or Performance above.'
            : settings.optimizeAuto
              ? `The ${mode} preset will be applied to options.txt and JVM flags on every launch.`
              : `The ${mode} preset is saved and used on launch (auto re-apply is off).`}
        </div>
      </section>

      <section className="settings-card">
        <button className="adv-toggle" onClick={() => setAdvanced((a) => !a)}>
          <IconGear size={15} /> Advanced {advanced ? '▴' : '▾'}
        </button>
        {advanced && (
          <div className="adv-body">
            <div className="field">
              <label className="field-label">Memory for Minecraft — {ramGb} GB {recommended ? <span className="field-hint">(recommended for your PC: {recommended} GB)</span> : null}</label>
              <input
                type="range" min="2" max="16" step="1" value={ramGb}
                className="ram-slider"
                style={{ '--fill': `${((ramGb - 2) / 14) * 100}%` }}
                onChange={(e) => saveSettings({ ...settings, ramGb: Number(e.target.value) })}
              />
              <div className="ram-marks"><span>2 GB</span><span>16 GB</span></div>
            </div>
            <div className="field">
              <label className="field-label">Render distance — {renderDist} chunks</label>
              <input
                type="range" min="2" max="16" step="1" value={renderDist}
                className="ram-slider"
                style={{ '--fill': `${((renderDist - 2) / 14) * 100}%` }}
                onChange={(e) => saveSettings({ ...settings, optimizeRenderDistance: Number(e.target.value) })}
              />
              <div className="ram-marks"><span>2</span><span>16</span></div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Extra JVM arguments</label>
              <input
                className="input"
                value={settings.extraJvmArgs || ''}
                placeholder="e.g. -XX:+UseG1GC -Dsun.rmi.dgc.server.gcInterval=2147483646"
                onChange={(e) => saveSettings({ ...settings, extraJvmArgs: e.target.value })}
                spellCheck={false}
              />
              <div className="field-hint">Only touch this if you know what you're doing — bad flags can break the game.</div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

/* ---- Storage ------------------------------------------------------------------ */

function StorageTab({ notify }) {
  const [storage, setStorage] = useState(null)
  const [cleaning, setCleaning] = useState(false)
  const [dataDir, setDataDir] = useState('')

  const load = useCallback(async () => {
    try {
      setStorage(await api.storageBreakdown())
    } catch (e) {
      notify(String(e), 'error')
    }
  }, [notify])

  useEffect(() => {
    api.appDataDir().then(setDataDir).catch(() => {})
    load()
  }, [load])

  const cleanJunk = async () => {
    setCleaning(true)
    try {
      const freed = await api.cleanStorageJunk()
      notify(freed > 0 ? `Cleaned ${fmtBytes(freed)} of junk` : 'Nothing to clean')
      setStorage(await api.storageBreakdown())
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setCleaning(false)
    }
  }

  const totalBytes = storage?.reduce((a, b) => a + b.bytes, 0) || 0
  const junkBytes = storage?.filter((i) => i.junk).reduce((a, b) => a + b.bytes, 0) || 0

  return (
    <>
      <section className="settings-card">
        <div className="settings-card-title"><IconDisk size={16} /> Storage</div>
        <div className="opt-toggle-row" style={{ paddingTop: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div className="toggle-title">Game data</div>
            <div className="toggle-sub data-dir">{dataDir || '…'}</div>
          </div>
        </div>
        {!storage ? (
          <div className="storage-list" style={{ marginTop: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="storage-row">
                <div style={{ flex: 1 }}><div className="skeleton skeleton-line" style={{ width: `${55 - i * 7}%` }} /></div>
                <div className="skeleton" style={{ width: 52, height: 12 }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="storage-total">{fmtBytes(totalBytes)} total · {fmtBytes(junkBytes)} safe to clean</div>
            <div className="storage-list">
              {storage.map((i) => (
                <div key={i.id} className="storage-row">
                  <div className="storage-label">
                    <span className="storage-name">{i.label}</span>
                    {i.hint && <span className="storage-hint">{i.hint}</span>}
                  </div>
                  {i.junk && <span className="junk-badge">junk</span>}
                  <span className="storage-bytes">{fmtBytes(i.bytes)}</span>
                </div>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="btn btn-primary" onClick={cleanJunk} disabled={cleaning || junkBytes === 0}>
                {cleaning ? <span className="mini-spinner" /> : <IconTrash size={14} />} Clean junk ({fmtBytes(junkBytes)})
              </button>
            </div>
          </>
        )}
        <div className="security-note">
          <IconShield size={14} />
          <span>Everything Soul stores lives on your PC only. Cleaning never touches your worlds, mods, accounts or game files — only caches, temp downloads and logs.</span>
        </div>
      </section>
    </>
  )
}

/* ---- Updates (was the Update page) ---------------------------------------------- */

function UpdatesTab({ notify }) {
  const [info, setInfo] = useState(null)
  const [checking, setChecking] = useState(true)
  const [downloading, setDownloading] = useState(null) // {done,total} | null
  const unlisten = useRef(null)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      setInfo(await api.checkUpdate())
    } catch (e) {
      setInfo({ error: String(e) })
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    check()
    api.onUpdateProgress((p) => setDownloading({ done: p.done || 0, total: p.total || 0 }))
      .then((u) => { unlisten.current = u })
    return () => { if (unlisten.current) unlisten.current() }
  }, [check])

  const runUpdate = async () => {
    if (!info?.assetUrl) return
    setDownloading({ done: 0, total: 0 })
    try {
      await api.downloadUpdate(info.assetUrl)
      // the app exits on its own once the installer opens
    } catch (e) {
      setDownloading(null)
      notify(String(e), 'error')
    }
  }

  const pct = downloading?.total ? Math.min(100, Math.round((downloading.done / downloading.total) * 100)) : null

  return (
    <>
      <section className="settings-card update-card">
        <div className="settings-card-title"><IconUpdate size={16} /> Launcher updates</div>
        {checking ? (
          <div className="loading-line"><span className="mini-spinner" /> Checking GitHub releases…</div>
        ) : info?.error ? (
          <>
            <div className="update-title">Couldn't check for updates</div>
            <div className="toggle-sub">{info.error}</div>
            <div className="confirm-actions update-actions">
              <button className="btn btn-primary" onClick={check}>Try again</button>
              <button className="btn btn-secondary" onClick={() => api.openUrl('https://github.com/unmid/SoulLauncher/releases')}>
                <IconExternal size={14} /> Releases page
              </button>
            </div>
          </>
        ) : info?.available ? (
          <>
            <div className="update-version-row">
              <div className="version-pill current">v{info.current}</div>
              <span className="update-arrow">→</span>
              <div className="version-pill latest">v{info.latest}</div>
            </div>
            {info.notes && <div className="update-notes">{info.notes.slice(0, 600)}</div>}
            {downloading ? (
              <div className="update-progress-wrap">
                <div className="mega-play-bar update-bar">
                  <div className="mega-play-bar-fill" style={pct != null ? { width: pct + '%' } : undefined} data-ind={pct == null ? '1' : '0'} />
                </div>
                <div className="update-progress-text">
                  {pct != null
                    ? `Downloading update — ${fmtBytes(downloading.done)} / ${fmtBytes(downloading.total)} (${pct}%)`
                    : 'Downloading update…'}
                </div>
                <div className="toggle-sub">Soul closes and the installer opens by itself when the download finishes.</div>
              </div>
            ) : info.assetUrl ? (
              <div className="confirm-actions update-actions">
                <button className="btn btn-primary" onClick={runUpdate}>
                  <IconDownload size={17} /> Update to v{info.latest}
                </button>
              </div>
            ) : (
              <div className="confirm-actions update-actions">
                <button className="btn btn-primary" onClick={() => api.openUrl(info.url)}>
                  <IconExternal size={14} /> Download v{info.latest} from GitHub
                </button>
              </div>
            )}
          </>
        ) : info ? (
          <div className="update-good">
            <span className="update-good-icon"><IconCheck size={24} /></span>
            <div>
              <div className="update-title">You're on the latest version — v{info.current}</div>
              <div className="toggle-sub">We'll tell you here the moment a new release drops on GitHub.</div>
            </div>
          </div>
        ) : null}
        {!checking && (
          <div className="confirm-actions update-actions" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost btn-small" onClick={check} disabled={checking || !!downloading}>
              <IconRefresh size={14} /> Check again
            </button>
          </div>
        )}
      </section>

      <section className="settings-card">
        <div className="settings-card-title">
          <img src="./icons/logo.png" width="20" height="20" alt="" draggable={false} /> About Soul Launcher
        </div>
        <div className="toggle-sub">Soul Launcher v1.0.0 · built for fast, one-click modded Minecraft.</div>
        <div className="fork-note">
          <IconInfo size={14} />
          <span>
            Soul Launcher is a <strong>fork of OpenLauncher</strong> — an open-source Minecraft launcher by
            CesarGarza55 (CodevBox). The Microsoft sign-in window shows OpenLauncher's name because both launchers
            share its official authentication service.
          </span>
        </div>
        <div className="confirm-actions update-actions">
          <button className="btn btn-secondary btn-small" onClick={() => api.openUrl('https://github.com/CesarGarza55/OpenLauncher')}>
            <IconGithub size={14} /> Upstream project
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => api.openUrl('https://github.com/unmid/SoulLauncher')}>
            <IconExternal size={14} /> Soul on GitHub
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => api.openUrl('https://discord.gg/Z7QfWSPJmJ')}>
            <IconDiscord size={14} /> Discord
          </button>
        </div>
      </section>
    </>
  )
}

/* ---- Logs (was the Log page) ----------------------------------------------------- */

function parseLine(line, index) {
  try {
    const value = JSON.parse(line)
    if (value && value.message) return { ...value, id: `${value.timestamp}-${index}` }
  } catch {}
  return { id: `raw-${index}`, timestamp: Date.now(), level: 'info', source: 'history', message: line }
}

function timeOf(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LogsTab({ notify }) {
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [loading, setLoading] = useState(true)
  const tailRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await api.readLogs()
      setEntries(raw.split(/\r?\n/).filter(Boolean).map(parseLine).slice(-900))
    } catch (e) {
      notify?.(`Couldn't read logs: ${String(e)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let stop = null
    Promise.resolve(api.onLog((entry) => {
      setEntries((current) => [...current, { ...entry, id: `${entry.timestamp}-${Math.random()}` }].slice(-900))
    })).then((unsubscribe) => { stop = unsubscribe })
    return () => { stop?.() }
  }, [])

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false
      return !q || `${entry.source} ${entry.message}`.toLowerCase().includes(q)
    })
  }, [entries, level, query])

  return (
    <section className="log-panel">
      <div className="log-toolbar">
        <div className="search-box log-search"><IconSearch size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter log output…" /></div>
        <div className="segment">
          {['all', 'info', 'error'].map((item) => <button key={item} className={`segment-btn ${level === item ? 'active' : ''}`} onClick={() => setLevel(item)}>{item}</button>)}
        </div>
        <button className="btn btn-secondary btn-small" onClick={load} disabled={loading}><IconRefresh size={14} /> Refresh</button>
        <span className="log-count">{visible.length} lines</span>
      </div>
      <div className="terminal" role="log" aria-live="polite">
        {loading && <div className="terminal-empty"><span className="mini-spinner" /> Opening log…</div>}
        {!loading && visible.length === 0 && <div className="terminal-empty"><IconCpu size={24} /> No matching log entries.</div>}
        {visible.map((entry) => (
          <div key={entry.id} className={`terminal-line terminal-${entry.level}`}>
            <span className="terminal-time">{timeOf(entry.timestamp)}</span>
            <span className="terminal-source">[{entry.source}]</span>
            <span className="terminal-message">{entry.message}</span>
          </div>
        ))}
        <div ref={tailRef} />
      </div>
      <div className="log-footer"><span className="log-live-dot" /> Live · logs are stored locally in the SoulLauncher data folder</div>
    </section>
  )
}

/* ---- page ------------------------------------------------------------------------ */

export default function SettingsPage({ settings, saveSettings, notify }) {
  const [tab, setTab] = useState('appearance')

  // Other pages can ask for a specific tab ('settings:updates' etc).
  useEffect(() => {
    const onSub = (e) => { if (TABS.some((t) => t.id === e.detail)) setTab(e.detail) }
    window.addEventListener('soul-subnav', onSub)
    return () => window.removeEventListener('soul-subnav', onSub)
  }, [])

  return (
    <div className="page">
      <div className="content-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Make Soul yours — looks, performance, storage and updates in one place.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={17} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'appearance' && <AppearanceTab settings={settings} saveSettings={saveSettings} />}
          {tab === 'performance' && <PerformanceTab settings={settings} saveSettings={saveSettings} notify={notify} />}
          {tab === 'storage' && <StorageTab notify={notify} />}
          {tab === 'updates' && <UpdatesTab notify={notify} />}
          {tab === 'logs' && <LogsTab notify={notify} />}
        </div>
      </div>
    </div>
  )
}
