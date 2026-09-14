import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOADER_META, LoaderMark, SpaceIcon, IconPlay, IconEdit, IconCopy, IconFolder, IconClock, IconShare, IconMore, IconWarn, IconExternal, IconTrash } from './icons.jsx'
import { api, saveFileDialog } from './api.js'
import { progressDetail } from './App.jsx'

export function progressPercent(p) {
  if (!p || !p.total || p.total === 0) return null
  return Math.min(100, Math.round((p.done / p.total) * 100))
}

const BUSY_STAGES = ['loader', 'version', 'files', 'java', 'launching']

export default function SpaceCard({ space, progress, onPlay, onEdit, onChanged, onDeleted, notify, draggable = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const menuButtonRef = useRef(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = LOADER_META[space.loader] || LOADER_META.vanilla
  const Mark = LoaderMark[space.loader] || LoaderMark.vanilla

  const pct = progressPercent(progress)
  const busy = progress && BUSY_STAGES.includes(progress.stage)
  const running = progress && progress.stage === 'running'

  useEffect(() => {
    if (!menuOpen) {
      setMenuAnchor(null)
      return undefined
    }
    const updateAnchor = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 198
      const gutter = 10
      const heightEstimate = 250
      const roomBelow = window.innerHeight - rect.bottom
      const left = Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter))
      const top = roomBelow < heightEstimate && rect.top > roomBelow
        ? Math.max(gutter, rect.top - heightEstimate - 8)
        : Math.max(gutter, Math.min(rect.bottom + 8, window.innerHeight - heightEstimate - gutter))
      setMenuAnchor({ top, left, width })
    }
    updateAnchor()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updateAnchor)
    window.addEventListener('scroll', updateAnchor, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updateAnchor)
      window.removeEventListener('scroll', updateAnchor, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!confirmDelete) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setConfirmDelete(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDelete])

  const playLabel = running
    ? 'Playing'
    : busy
      ? (progress.stage === 'files' && pct != null ? `${pct}%` : 'Getting ready…')
      : 'Play'

  const counts = { mod: 0, resourcepack: 0, shader: 0 }
  for (const m of space.mods || []) counts[m.kind] = (counts[m.kind] || 0) + 1

  const duplicate = async () => {
    setMenuOpen(false)
    try {
      await api.duplicateSpace(space.id)
      onChanged()
      notify('Space duplicated')
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const exportSpace = async () => {
    setMenuOpen(false)
    try {
      const safeName = space.name.replace(/[^\w-]+/g, '_') || 'space'
      const path = await saveFileDialog({
        title: 'Export Space',
        defaultPath: `${safeName}.soulspace.json`,
        filters: [{ name: 'Soul Space', extensions: ['json'] }],
      })
      if (!path) return
      await api.exportSpace(space.id, path)
      notify('Space exported — share the file with a friend')
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const openFolder = async () => {
    setMenuOpen(false)
    try { await api.openSpaceFolder(space.id) } catch (e) { notify(String(e), 'error') }
  }

  const pinToDesktop = async () => {
    setMenuOpen(false)
    try {
      await api.pinSpaceShortcut(space.id)
      notify(`Pinned to Desktop — double-click “Soul - ${space.name}” to launch straight into the game`)
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    try {
      await api.deleteSpace(space.id, true)
      onDeleted()
      notify('Space deleted')
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  return (
    <div
      className={`space-card ${running ? 'space-card-running' : ''} ${draggable ? 'space-card-draggable' : ''}`}
      style={{ '--space-color': space.color }}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return
        e.dataTransfer.setData('text/soul-space', space.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <div className="space-card-glow" />
      <div className="space-card-top">
        <div className="space-icon" aria-hidden="true">
          <SpaceIcon name={space.icon} size={34} />
        </div>
        <button
          ref={menuButtonRef}
          className="space-menu-btn"
          title="Options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
        >
          <IconMore size={19} />
        </button>
        {menuOpen && menuAnchor && createPortal(
          <div className="menu-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) setMenuOpen(false) }}>
            <div className="space-menu space-menu-pop" role="menu" style={{ top: menuAnchor.top, left: menuAnchor.left, width: menuAnchor.width }} onMouseDown={(e) => e.preventDefault()}>
              <button onClick={() => { setMenuOpen(false); onEdit(space) }}><IconEdit size={16} /> Edit</button>
              <button onClick={pinToDesktop}><IconExternal size={16} /> Pin to Desktop</button>
              <button onClick={duplicate}><IconCopy size={16} /> Duplicate</button>
              <button onClick={exportSpace}><IconShare size={16} /> Export</button>
              <button onClick={openFolder}><IconFolder size={16} /> Open folder</button>
              <button className="danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}><IconTrash size={16} /> Delete</button>
            </div>
          </div>,
          document.body,
        )}
      </div>

      <div className="space-name">{space.name}</div>
      <div className="space-tags">
        <span className="tag tag-loader">
          <Mark size={15} /> {meta.label}{space.loaderVersion ? ' ' + space.loaderVersion : ''}
        </span>
        <span className="tag">{space.mcVersion}</span>
        {counts.mod > 0 && <span className="tag">{counts.mod} mod{counts.mod > 1 ? 's' : ''}</span>}
        {counts.resourcepack > 0 && <span className="tag">{counts.resourcepack} pack{counts.resourcepack > 1 ? 's' : ''}</span>}
        {counts.shader > 0 && <span className="tag">{counts.shader} shader{counts.shader > 1 ? 's' : ''}</span>}
        {space.lastPlayed > 0 && <span className="tag tag-muted"><IconClock size={11} /> {timeAgo(space.lastPlayed)}</span>}
      </div>

      <button
        className={`play-btn ${running ? 'play-btn-running' : ''}`}
        disabled={busy && !running}
        onClick={onPlay}
      >
        {busy && !running ? (
          <>
            <span className="play-spinner" />
            <span>{playLabel}</span>
          </>
        ) : (
          <>
            <IconPlay size={17} />
            <span>{playLabel}</span>
          </>
        )}
      </button>

      {busy && (
        <div className="space-progress">
          <div className="space-progress-bar" style={{ width: pct != null ? `${pct}%` : '35%' }} data-ind={pct == null ? '1' : '0'} />
        </div>
      )}
      {busy && progress.message && (
        <div className="space-stage">
          <span className="space-stage-text">{friendlyStage(progress)}</span>
          {progress.stage === 'files' && pct != null && <span className="space-stage-pct">{pct}%</span>}
        </div>
      )}

      {confirmDelete && createPortal(
        <div className="confirm-pop" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-card" role="dialog" aria-modal="true" aria-label={`Delete ${space.name}`} onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon warn"><IconWarn size={28} /></div>
            <div className="confirm-title">Delete “{space.name}”?</div>
            <div className="confirm-text">Worlds, mods and settings inside this Space will be gone forever.</div>
            <div className="confirm-actions">
              <button className="btn" autoFocus onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn btn-danger" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function friendlyStage(p) {
  if (p.stage === 'files' && p.total > 0) return progressDetail(p)
  switch (p.stage) {
    case 'loader': return p.message?.startsWith('Installing') ? p.message.slice(0, 60) : 'Setting up the game…'
    case 'java': return 'Getting Java ready…'
    case 'launching': return 'Launching Minecraft…'
    case 'version': return 'Reading version info…'
    default: return p.message || 'Working…'
  }
}

export function timeAgo(ts) {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago'
  return new Date(ts * 1000).toLocaleDateString()
}
