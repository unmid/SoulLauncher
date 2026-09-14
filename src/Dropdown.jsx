import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Engine dropdown — portal menu, never clipped, icons never eat clicks.
 * Fix for the fabric.png bug: the menu lives in document.body (portal), so
 * outside-click detection MUST include the menu element itself. The old code
 * only checked the toggle root, so clicking any option with an <img> counted
 * as "outside" and closed the menu before onChange fired.
 * Images inside options are pointer-events:none + draggable=false.
 */
export default function Dropdown({ value, onChange, options, placeholder = 'Select…', filter = false, className = '', renderOption = null, renderValue = null }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [q, setQ] = useState('')
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click / Escape — menu portal counts as "inside".
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const inRoot = rootRef.current && rootRef.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inRoot && !inMenu) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open ])

  const positionMenu = useCallback(() => {
    if (!rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(Math.max(rect.width, 240), 420, window.innerWidth - gutter * 2)
    const estimatedHeight = Math.min(320, 70 + Math.min(options.length, 7) * 40)
    const roomBelow = window.innerHeight - rect.bottom
    const shouldGoUp = roomBelow < estimatedHeight + gutter && rect.top > roomBelow
    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter))
    const top = Math.max(gutter, Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - gutter))
    setUp(shouldGoUp)
    setMenuStyle(shouldGoUp
      ? { position: 'fixed', left, bottom: Math.max(gutter, window.innerHeight - rect.top + 6), width, maxHeight: `calc(100vh - ${gutter * 2}px)` }
      : { position: 'fixed', left, top, width, maxHeight: `calc(100vh - ${gutter * 2}px)` })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    setQ('')
    positionMenu()
    if (filter) setTimeout(() => searchRef.current?.focus(), 0)
    const onViewportChange = () => positionMenu()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, filter, positionMenu])

  useLayoutEffect(() => {
    if (open && menuRef.current) {
      menuRef.current.querySelector('.dd-option.selected')?.scrollIntoView({ block: 'center' })
    }
  }, [open])

  const visible = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options

  const pick = (v) => { onChange(v); setOpen(false) }

  return (
    <div ref={rootRef} className={`dd ${className}`}>
      <button type="button" className={`dd-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="dd-toggle-label">
          {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="dd-arrow" style={open && !up ? { transform: 'rotate(180deg)' } : undefined}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && menuStyle && createPortal(
        <>
          <div className="menu-layer" onPointerDown={(e) => {
            // Clicks on the transparent layer close; clicks inside menu don't reach here.
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
          }} />
          <div ref={menuRef} className={`dd-list dd-portal ${up ? 'dd-up' : ''}`} role="listbox" style={{ ...menuStyle, pointerEvents: 'auto' }}>
            {filter && (
              <input ref={searchRef} className="dd-search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Type to filter…" onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter' && visible.length > 0) pick(visible[0].value) }} />
            )}
            <div className="dd-scroll">
              {visible.map((o) => (
                <button key={o.value} type="button" role="option" aria-selected={o.value === value}
                  className={`dd-option ${o.value === value ? 'selected' : ''}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => pick(o.value)} title={o.label}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, pointerEvents: 'none' }}>
                    {renderOption ? renderOption(o) : null}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  </span>
                  {o.hint && <span className="dd-hint" style={{ pointerEvents: 'none' }}>{o.hint}</span>}
                </button>
              ))}
              {visible.length === 0 && <div className="dd-empty">No match</div>}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
