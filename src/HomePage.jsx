import { useEffect, useMemo, useRef, useState } from 'react'
import { api, openFileDialog } from './api.js'
import {
  IconRocket, IconPlay, IconGlobe, IconShield, IconClock, IconBolt, IconLayers,
  AppIcon, SpaceIcon, LOADER_META, LoaderMark, IconNews, IconDiscord, IconCheck, IconPlus,
} from './icons.jsx'
import { progressDetail, stageText } from './App.jsx'

const DISCORD_URL = 'https://discord.gg/Z7QfWSPJmJ'
const RELEASENOTES_URL = 'https://github.com/unmid/SoulLauncher/releases'
const WALLPAPERS = ['./wallpapers/w1.png', './wallpapers/w2.png', './wallpapers/w3.png', './wallpapers/w4.png']
const WALLPAPER_INTERVAL = 32000
const BUSY_STAGES = ['loader', 'version', 'files', 'java', 'launching']

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Up late?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/* Slow-crossfading wallpaper slideshow. Off entirely when the user disables
   wallpapers — the page then sits on the plain app background. */
function HomeBackground({ enabled }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setIndex((i) => (i + 1) % WALLPAPERS.length), WALLPAPER_INTERVAL)
    return () => clearInterval(t)
  }, [enabled])
  if (!enabled) return null
  return (
    <div className="home-bg" aria-hidden="true">
      {WALLPAPERS.map((src, i) => (
        <div key={src} className={`home-bg-img ${i === index ? 'show' : ''}`} style={{ backgroundImage: `url(${src})` }} />
      ))}
      <div className="home-bg-scrim" />
    </div>
  )
}

/* Drop-up game picker anchored above the dock. */
function SpacePicker({ spaces, selectedSpace, onSelect, onNew }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const Mark = selectedSpace ? (LoaderMark[selectedSpace.loader] || LoaderMark.vanilla) : null
  const meta = selectedSpace ? (LOADER_META[selectedSpace.loader] || LOADER_META.vanilla) : null

  return (
    <div className="dock-pop-wrap" ref={wrapRef}>
      <button
        className="dock-select"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ '--space-color': selectedSpace?.color || 'var(--accent)' }}
      >
        {selectedSpace ? (
          <>
            <span className="dock-select-icon"><SpaceIcon name={selectedSpace.icon} size={26} /></span>
            <span className="dock-select-text">
              <span className="dock-select-name">{selectedSpace.name}</span>
              <span className="dock-select-meta">
                {Mark && <Mark size={11} />} {meta.label}{selectedSpace.loaderVersion ? ` ${selectedSpace.loaderVersion}` : ''} · Minecraft {selectedSpace.mcVersion}
              </span>
            </span>
          </>
        ) : (
          <span className="dock-select-text">
            <span className="dock-select-name">Select a game</span>
            <span className="dock-select-meta">Pick one of your Spaces</span>
          </span>
        )}
        <svg className="dock-select-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={open ? { transform: 'rotate(180deg)' } : undefined}>
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {open && (
        <div className="dock-pop" role="listbox" aria-label="Your Spaces">
          {spaces.map((space) => {
            const M = LoaderMark[space.loader] || LoaderMark.vanilla
            return (
              <button
                key={space.id}
                role="option"
                aria-selected={selectedSpace?.id === space.id}
                className={`dock-pop-row ${selectedSpace?.id === space.id ? 'selected' : ''}`}
                onClick={() => { onSelect(space.id); setOpen(false) }}
              >
                <span className="dock-pop-icon" style={{ '--c': space.color }}><SpaceIcon name={space.icon} size={20} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="dock-pop-name">{space.name}</span>
                  <span className="dock-pop-meta"><M size={10} /> {LOADER_META[space.loader]?.label || space.loader} · {space.mcVersion}</span>
                </span>
                {selectedSpace?.id === space.id && <span className="version-row-check"><IconCheck size={15} /></span>}
              </button>
            )
          })}
          <div className="dock-pop-sep" />
          <button className="dock-pop-row dock-pop-new" onClick={() => { setOpen(false); onNew() }}>
            <span className="dock-pop-icon"><IconPlus size={16} /></span>
            <span className="dock-pop-name">New Space…</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function HomePage({ settings, spaces, selectedSpace, activeAccount, selectSpace, play, progress, openWizard, refreshSpaces, notify, navigate }) {
  const [update, setUpdate] = useState(null)
  const [packBusy, setPackBusy] = useState(false)

  // One quiet update probe; failures are invisible here on purpose.
  useEffect(() => {
    let alive = true
    api.checkUpdate()
      .then((info) => { if (alive && info?.available) setUpdate(info) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const importModpack = async () => {
    try {
      const path = await openFileDialog({
        title: 'Install a modpack',
        filters: [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }],
        multiple: false,
      })
      if (!path) return
      setPackBusy(true)
      const space = await api.importModpackFile(path)
      notify(`"${space.name}" (Minecraft ${space.mcVersion}) is being set up — watch its card fill up`)
      refreshSpaces()
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setPackBusy(false)
    }
  }

  const recent = useMemo(() => spaces
    .slice()
    .sort((a, b) => (b.lastPlayed || b.createdAt || 0) - (a.lastPlayed || a.createdAt || 0))
    .slice(0, 8), [spaces])

  const heroProgress = selectedSpace ? progress[selectedSpace.id] : null
  const busy = heroProgress && BUSY_STAGES.includes(heroProgress.stage)
  const started = heroProgress?.stage === 'running'
  const pct = heroProgress && heroProgress.total ? Math.min(100, Math.round((heroProgress.done / heroProgress.total) * 100)) : null

  return (
    <div className="page-full">
      <HomeBackground enabled={settings?.wallpapers !== false} />
      <div className="page-inner home-content">
        <div className="home-greet">
          <div className="home-greet-kicker">{greeting()}{activeAccount ? `, ${activeAccount.username}` : ''}</div>
          <h1 className="home-greet-title">Ready when you are.</h1>
          <p className="home-greet-sub">
            {spaces.length === 0
              ? 'A Space keeps one Minecraft version, its loader and its mods together — neatly isolated from everything else.'
              : `${spaces.length} Space${spaces.length > 1 ? 's' : ''} on this PC · everything is stored locally and stays yours.`}
          </p>
        </div>

        {spaces.length === 0 ? (
          <section className="hero-card" style={{ maxWidth: 560, margin: '26px auto 0', width: '100%' }}>
            <div className="hero-empty">
              <div className="hero-empty-icon"><IconRocket size={34} /></div>
              <h2>Set up your first Space</h2>
              <p>Pick a Minecraft version, choose a loader if you want mods, and press Play. It takes about a minute.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-big" onClick={() => openWizard('new')}>
                  <IconRocket size={17} /> New Space
                </button>
                <button className="btn btn-secondary btn-big" onClick={importModpack} disabled={packBusy}>
                  {packBusy ? <span className="mini-spinner" /> : <AppIcon name="download" size={17} />} From modpack…
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <h2 className="home-section-title">
                  <IconClock size={15} /> Jump back in
                  {spaces.length > 8 && (
                    <button className="home-section-link" onClick={() => navigate('library')}>All Spaces →</button>
                  )}
                </h2>
                <div className="recent-grid">
                  {recent.map((space) => {
                    const tileBusy = progress[space.id] && BUSY_STAGES.includes(progress[space.id].stage)
                    const Mark = LoaderMark[space.loader] || LoaderMark.vanilla
                    return (
                      <div
                        key={space.id}
                        className={`recent-tile ${selectedSpace?.id === space.id ? 'active' : ''}`}
                        onClick={() => selectSpace(space.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') selectSpace(space.id) }}
                      >
                        <span className="recent-icon" style={{ background: space.color }}><SpaceIcon name={space.icon} size={24} /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="recent-tile-name">{space.name}</span>
                          <span className="recent-tile-meta" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Mark size={11} /> {space.mcVersion} · {LOADER_META[space.loader]?.label || space.loader}
                          </span>
                        </span>
                        <button
                          className="recent-play"
                          disabled={tileBusy}
                          title={`Play ${space.name}`}
                          onClick={(e) => { e.stopPropagation(); selectSpace(space.id); play(space) }}
                        >
                          <IconPlay size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <section style={{ marginTop: 18 }}>
              <h2 className="home-section-title"><IconBolt size={15} /> Quick actions</h2>
              <div className="quick-grid">
                <button className="quick-tile" onClick={() => openWizard('new')}>
                  <span className="quick-tile-ic"><IconRocket size={16} /></span>
                  New Space
                </button>
                <button className="quick-tile" onClick={importModpack} disabled={packBusy}>
                  <span className="quick-tile-ic"><AppIcon name="download" size={16} active={packBusy} /></span>
                  Install modpack
                </button>
                <button className="quick-tile" onClick={() => navigate('servers')}>
                  <span className="quick-tile-ic"><IconGlobe size={15} /></span>
                  Browse servers
                </button>
                <button className="quick-tile" onClick={() => navigate('settings')}>
                  <span className="quick-tile-ic"><AppIcon name="tune" size={16} /></span>
                  Customize Soul
                </button>
                <button className="quick-tile" onClick={() => api.openUrl(DISCORD_URL)} title="Community, support and sneak peeks">
                  <span className="quick-tile-ic"><IconDiscord size={15} /></span>
                  Discord
                </button>
                <button className="quick-tile" onClick={() => api.openUrl(RELEASENOTES_URL)} title="What's new in Soul Launcher">
                  <span className="quick-tile-ic"><IconNews size={15} /></span>
                  Changelog
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="home-privacy">
                  <IconShield size={13} />
                  Everything stays on this PC — no tracking, no accounts with us.
                </span>
              </div>
            </section>

            {update && (
              <div className="update-banner" role="status" style={{ marginTop: 18 }}>
                <AppIcon name="update-available" size={18} />
                <span>Soul v{update.latest} is out — you're on v{update.current}</span>
                <button className="btn btn-primary btn-small" onClick={() => navigate('settings:updates')}>
                  Review update
                </button>
              </div>
            )}
          </>
        )}

        {/* bottom dock: drop-up game picker + play */}
        <div className="home-dock">
          {spaces.length > 0 ? (
            <>
              <SpacePicker spaces={spaces} selectedSpace={selectedSpace} onSelect={selectSpace} onNew={() => openWizard('new')} />
              <button
                className={`dock-play ${started ? 'running' : ''}`}
                disabled={!selectedSpace || busy || started}
                onClick={() => selectedSpace && play(selectedSpace)}
              >
                {busy || started ? (
                  <div className="hero-progress" role="status" aria-live="polite">
                    <div className="hero-progress-row">
                      <span>{stageText(heroProgress)}</span>
                      {pct != null && <span className="hero-progress-pct">{pct}%</span>}
                    </div>
                    <div className="hero-progress-bar">
                      <div className="hero-progress-fill" style={started ? { width: '100%' } : (pct != null ? { width: pct + '%' } : undefined)} data-ind={started || pct != null ? '0' : '1'} />
                    </div>
                  </div>
                ) : (
                  <><IconPlay size={20} /><span>PLAY</span></>
                )}
              </button>
            </>
          ) : (
            <button className="dock-select" onClick={() => openWizard('new')} style={{ justifyContent: 'center', padding: 14 }}>
              <span className="dock-select-text" style={{ alignItems: 'center' }}>
                <span className="dock-select-name">Create your first Space</span>
                <span className="dock-select-meta">One minute setup — version, loader, done</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
