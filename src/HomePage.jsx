import { Component, useEffect, useRef, useState } from 'react'
import { api, openFileDialog } from './api.js'
import {
  IconRocket, IconPlay, IconCheck, IconPlus,
  SpaceIcon, LOADER_META, LoaderMark,
} from './icons.jsx'
import { stageText } from './App.jsx'

const WALLPAPERS = ['./wallpapers/w1.png', './wallpapers/w2.png', './wallpapers/w3.png', './wallpapers/w4.png']
const BUSY_STAGES = ['loader', 'version', 'files', 'java', 'launching']

function HomeBackground({ enabled }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setIndex((i) => (i + 1) % WALLPAPERS.length), 32000)
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
      <button className="dock-select" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        style={{ '--space-color': selectedSpace?.color || 'var(--accent)' }}>
        {selectedSpace ? (
          <>
            <span className="dock-select-icon"><SpaceIcon name={selectedSpace.icon} size={30} /></span>
            <span className="dock-select-text">
              <span className="dock-select-name">{selectedSpace.name}</span>
              <span className="dock-select-meta">
                {Mark && <Mark size={16} />} {meta.label} · Minecraft {selectedSpace.mcVersion}
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
              <button key={space.id} role="option" aria-selected={selectedSpace?.id === space.id}
                className={`dock-pop-row ${selectedSpace?.id === space.id ? 'selected' : ''}`}
                onClick={() => { onSelect(space.id); setOpen(false) }}>
                <span className="dock-pop-icon" style={{ '--c': space.color }}><SpaceIcon name={space.icon} size={24} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="dock-pop-name">{space.name}</span>
                  <span className="dock-pop-meta"><M size={16} /> {LOADER_META[space.loader]?.label || space.loader} · {space.mcVersion}</span>
                </span>
                {selectedSpace?.id === space.id && <span className="version-row-check"><IconCheck size={15} /></span>}
              </button>
            )
          })}
          <div className="dock-pop-sep" />
          <button className="dock-pop-row dock-pop-new" onClick={() => { setOpen(false); onNew() }}>
            <span className="dock-pop-icon"><IconPlus size={18} /></span>
            <span className="dock-pop-name">New Space…</span>
          </button>
        </div>
      )}
    </div>
  )
}

/* Crash-proof wrapper: if the picker ever throws while opening/selecting,
   the Home page shows a safe fallback instead of an error wall. */
class PickerBoundary extends Component {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  componentDidCatch(e) {
    console.error(e)
    try { this.props.notify?.('Space picker hit a problem: ' + String(e?.message || e), 'error') } catch {}
  }
  render() {
    if (this.state.bad) {
      return (
        <button className="dock-select" onClick={this.props.onNew} style={{ justifyContent: 'center', padding: 14 }}>
          <span className="dock-select-text" style={{ alignItems: 'center' }}>
            <span className="dock-select-name">Pick a Space in the Library</span>
            <span className="dock-select-meta">Picker recovered from an error</span>
          </span>
        </button>
      )
    }
    return this.props.children
  }
}

export default function HomePage({ settings, spaces, selectedSpace, selectSpace, play, progress, openWizard, refreshSpaces, notify }) {
  const [packBusy, setPackBusy] = useState(false)
  const importModpack = async () => {
    try {
      const path = await openFileDialog({ title: 'Install a modpack', filters: [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }], multiple: false })
      if (!path) return
      setPackBusy(true)
      const space = await api.importModpackFile(path)
      notify(`"${space.name}" is being set up — watch its card fill up`)
      refreshSpaces()
    } catch (e) { notify(String(e), 'error') }
    finally { setPackBusy(false) }
  }
  const SoulMark = LoaderMark.soul || LoaderMark.vanilla
  const heroProgress = selectedSpace ? progress[selectedSpace.id] : null
  const busy = heroProgress && BUSY_STAGES.includes(heroProgress.stage)
  const started = heroProgress?.stage === 'running'
  const pct = heroProgress && heroProgress.total ? Math.min(100, Math.round((heroProgress.done / heroProgress.total) * 100)) : null

  const safeSelect = async (id) => {
    try {
      await selectSpace(id)
    } catch (e) {
      notify('Could not switch Space: ' + String(e?.message || e), 'error')
    }
  }

  return (
    <div className="page-full">
      <HomeBackground enabled={settings?.wallpapers !== false} />
      <div className="page-inner home-content">
        {spaces.length === 0 ? (
          <section className="hero-card" style={{ maxWidth: 600, margin: '6px auto 0', width: '100%' }}>
            <div className="hero-empty">
              <div className="hero-empty-icon"><IconRocket size={30} /></div>
              <h2>Set up your first Space</h2>
              <p>Pick a version, choose Soul Client or a loader, press Play. About a minute.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-big" onClick={() => openWizard('new')}><IconRocket size={17} /> New Space</button>
                <button className="btn btn-secondary btn-big" onClick={() => openWizard({ mode: 'new', loader: 'soul' })}><SoulMark size={20} /> Get Soul Client</button>
              </div>
              <button className="btn btn-ghost btn-small" style={{ marginTop: 12 }} onClick={importModpack} disabled={packBusy}>
                {packBusy ? <span className="mini-spinner" /> : 'Or install from a modpack file'}
              </button>
            </div>
          </section>
        ) : null}

        <div className="home-dock">
          {spaces.length > 0 ? (
            <>
              <PickerBoundary notify={notify} onNew={() => openWizard('new')}>
                <SpacePicker spaces={spaces} selectedSpace={selectedSpace} onSelect={safeSelect} onNew={() => openWizard('new')} />
              </PickerBoundary>
              <button className={`dock-play ${started ? 'running' : ''}`} disabled={!selectedSpace || busy || started}
                onClick={() => selectedSpace && play(selectedSpace)}>
                {busy || started ? (
                  <span className="hero-progress" role="status" aria-live="polite">
                    <span className="hero-progress-row"><span>{stageText(heroProgress)}</span>{pct != null && <span className="hero-progress-pct">{pct}%</span>}</span>
                    <span className="hero-progress-bar"><span className="hero-progress-fill" style={started ? { width: '100%' } : (pct != null ? { width: pct + '%' } : undefined)} data-ind={started || pct != null ? '0' : '1'} /></span>
                  </span>
                ) : (<><IconPlay size={20} /><span>PLAY</span></>)}
              </button>
            </>
          ) : (
            <button className="dock-select" onClick={() => openWizard('new')} style={{ justifyContent: 'center', padding: 14 }}>
              <span className="dock-select-text" style={{ alignItems: 'center' }}>
                <span className="dock-select-name">Create your first Space</span>
                <span className="dock-select-meta">One minute setup</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
