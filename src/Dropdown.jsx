import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Paper-styled dropdown that never leaks off-screen:
 * fixed max-height + scroll, optional type-to-filter for long lists,
 * flips upwards when there isn't enough room below.
 */
export default function Dropdown({ value, onChange, options, placeholder = 'Select…', filter = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [q, setQ] = useState('')
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const searchRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Position the menu against the viewport rather than the wizard/card. This
  // prevents long version lists from escaping the right or bottom edge.
  const positionMenu = useCallback(() => {
    if (!rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(Math.max(rect.width, 240), 420, window.innerWidth - gutter * 2)
    const estimatedHeight = Math.min(320, 70 + Math.min(options.length, 7) * 36)
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

  // scroll the selected option into view on open
  useLayoutEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector('.dd-option.selected')?.scrollIntoView({ block: 'center' })
    }
  }, [open])

  const visible = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options

  return (
    <div ref={rootRef} className={`dd ${className}`}>
      <button
        type="button"
        className={`dd-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="dd-toggle-label">{selected ? selected.label : placeholder}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="dd-arrow" style={open && !up ? { transform: 'rotate(180deg)' } : undefined}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && menuStyle && createPortal(
        <div className={`dd-list dd-portal ${up ? 'dd-up' : ''}`} role="listbox" style={menuStyle}>
          {filter && (
            <input
              ref={searchRef}
              className="dd-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to filter…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visible.length > 0) {
                  onChange(visible[0].value)
                  setOpen(false)
                }
              }}
            />
          )}
          <div className="dd-scroll" ref={listRef}>
            {visible.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-option ${o.value === value ? 'selected' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false) }}
                title={o.label}
              >
                {o.label}
                {o.hint && <span className="dd-hint">{o.hint}</span>}
              </button>
            ))}
            {visible.length === 0 && <div className="dd-empty">No match</div>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
