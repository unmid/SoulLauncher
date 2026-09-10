import { useEffect, useRef, useState } from 'react'
import { api, openFileDialog } from './api.js'
import {
  IconRocket, IconPlay, IconCheck, IconPlus,
  SpaceIcon, LOADER_META, LoaderMark,
} from './icons.jsx'
import { progressDetail, stageText } from './App.jsx'

const WALLPAPERS = ['./wallpapers/w1.png', './wallpapers/w2.png', './wallpapers/w3.png', './wallpapers/w4.png']
const WALLPAPER_INTERVAL = 32000
const BUSY_STAGES = ['loader', 'version', 'files', 'java', 'launching']

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
  const [packBusy, setPackBusy] = useState(false)

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

  const SoulMark = LoaderMark.soul || LoaderMark.vanilla

  const heroProgress = selectedSpace ? progress[selectedSpace.id] : null
  const busy = heroProgress && BUSY_STAGES.includes(heroProgress.stage)
  const started = heroProgress?.stage === 'running'
  const pct = heroProgress && heroProgress.total ? Math.min(100, Math.round((heroProgress.done / heroProgress.total) * 100)) : null

  return (
    <div className="page-full">
      <HomeBackground enabled={settings?.wallpapers !== false} />
      <div className="page-inner home-content">
        {spaces.length === 0 && (
          <section className="hero-card" style={{ maxWidth: 600, margin: '26px auto 0', width: '100%' }}>
            <div className="hero-empty">
              <div className="hero-empty-icon"><IconRocket size={34} /></div>
              <h2>Set up your first Space</h2>
              <p>Pick a Minecraft version, choose Soul Client or another loader, and press Play. It takes about a minute.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-big" onClick={() => openWizard('new')}>
                  <IconRocket size={17} /> New Space
                </button>
                <button className="btn btn-secondary btn-big" onClick={() => openWizard({ mode: 'new', loader: 'soul' })}>
                  <SoulMark size={18} /> Get Soul Client
                </button>
              </div>
              <button className="btn btn-ghost btn-small" style={{ marginTop: 12 }} onClick={importModpack} disabled={packBusy}>
                {packBusy ? <span className="mini-spinner" /> : 'Or install from a modpack file'}
              </button>
            </div>
          </section>
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
