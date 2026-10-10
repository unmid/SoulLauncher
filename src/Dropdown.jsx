import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Engine dropdown — portal menu, never clipped, keyboard-first.
 * - Menu portals to document.body; outside-click checks root AND menu.
 * - Positioning is room-based: side (up/down) is picked from an estimate,
 *   but maxHeight always comes from the real free space on that side, so
 *   the menu can never overflow the viewport bottom/top.
 * - Keyboard: ↑/↓/Home/End move a cursor, Enter picks, Esc closes this
 *   dropdown only (capture + stopPropagation so modals don't also close),
 *   printable chars type-ahead (closed toggle, or open menu without filter).
 * - Options are <button role="option">; images inside are pointer-events:none.
 */
export default function Dropdown({ value, onChange, options, placeholder = 'Select…', filter = false, className = '', renderOption = null, renderValue = null }) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(-1)
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const toggleRef = useRef(null)
  const menuRef = useRef(null)
  const scrollRef = useRef(null)
  const searchRef = useRef(null)
  const typeRef = useRef({ buf: '', t: 0 })

  const selected = options.find((o) => o.value === value)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  }, [options, q])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setMenuStyle(null)
    setCursor(-1)
    if (refocus) toggleRef.current?.focus()
  }, [])

  // Outside click / Escape (capture: dismiss only this dropdown, never the
  // outer Space Wizard modal that also listens for Escape).
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const inRoot = rootRef.current && rootRef.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inRoot && !inMenu) close(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, close])

  const positionMenu = useCallback(() => {
    if (!rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(Math.max(rect.width, 240), 460, window.innerWidth - gutter * 2)
    const searchH = filter ? 50 : 0
    const est = 14 + searchH + Math.min(visible.length, 7) * 37 + (visible.length === 0 ? 34 : 0)
    const roomBelow = window.innerHeight - rect.bottom - gutter - 6
    const roomAbove = rect.top - gutter - 6
    const goUp = roomBelow < Math.min(est, 240) && roomAbove > roomBelow
    const side = goUp ? roomAbove : roomBelow
    const maxHeight = Math.max(120, Math.min(side, window.innerHeight - gutter * 2))
    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter))
    setUp(goUp)
    setMenuStyle(goUp
      ? { position: 'fixed', left, bottom: gutter + 6, width, maxHeight }
      : { position: 'fixed', left, top: rect.bottom + 6, width, maxHeight })
  }, [visible.length, filter])

  // Open: reset state, position, focus search (filter) or the menu itself.
  useLayoutEffect(() => {
    if (!open) return
    setQ('')
    positionMenu()
    const idx = visible.findIndex((o) => o.value === value)
    setCursor(idx >= 0 ? idx : visible.length ? 0 : -1)
    if (filter) setTimeout(() => searchRef.current?.focus(), 0)
    else setTimeout(() => menuRef.current?.focus(), 0)
    const onViewportChange = () => positionMenu()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Re-position when the filtered row count changes (side may flip).
  useLayoutEffect(() => {
    if (open) positionMenu()
  }, [open, positionMenu])

  // Keep the cursor row visible inside the menu's own scroller only —
  // never scrollIntoView, which also yanks the parent modal.
  useEffect(() => {
    if (!open || cursor < 0) return
    const sc = scrollRef.current
    if (!sc) return
    const el = sc.querySelector(`[data-idx="${cursor}"]`)
    if (!el) return
    const top = el.offsetTop - sc.offsetTop
    const bottom = top + el.offsetHeight
    if (top < sc.scrollTop) sc.scrollTop = top
    else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight
  }, [open, cursor, visible])

  const pick = (v) => { onChange(v); close(true) }

  const jumpCursor = (next) => {
    const n = visible.length
    if (!n) return
    const wrapped = ((next % n) + n) % n
    setCursor(wrapped)
  }

  const typeahead = (ch) => {
    const now = Date.now()
    const st = typeRef.current
    st.buf = now - st.t < 700 ? st.buf + ch : ch
    st.t = now
    const needle = st.buf.toLowerCase()
    const from = cursor + 1
    for (let k = 0; k < visible.length; k++) {
      const i = (from + k) % visible.length
      if (visible[i].label.toLowerCase().startsWith(needle)) { setCursor(i); return }
    }
  }

  const onMenuKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); jumpCursor(cursor + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); jumpCursor(cursor - 1) }
    else if (e.key === 'Home') { e.preventDefault(); jumpCursor(0) }
    else if (e.key === 'End') { e.preventDefault(); jumpCursor(visible.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = visible[cursor] || (filter && visible.length === 1 ? visible[0] : null)
      if (o) pick(o.value)
      else if (filter && visible.length) pick(visible[0].value)
    } else if (!filter && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      typeahead(e.key)
    }
  }

  const onToggleKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    } else if (!filter && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      typeahead(e.key)
      if (cursor >= 0 && visible[cursor] && typeRef.current.buf.length) {
        // single exact-prefix jump happens on next open via cursor default;
        // jump now if only one match for the buffer:
        const matches = visible.filter((o) => o.label.toLowerCase().startsWith(typeRef.current.buf.toLowerCase()))
        if (matches.length === 1) {
          onChange(matches[0].value)
          e.preventDefault()
        }
      }
    }
  }

  return (
    <div ref={rootRef} className={`dd ${className}`}>
      <button
        ref={toggleRef}
        type="button"
        id={`${uid}-toggle`}
        className={`dd-toggle ${open ? 'open' : ''}`}
        onClick={() => (open ? close(true) : setOpen(true))}
        onKeyDown={onToggleKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
      >
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
            if (menuRef.current && !menuRef.current.contains(e.target)) close(false)
          }} />
          <div
            ref={menuRef}
            id={`${uid}-list`}
            className={`dd-list dd-portal ${up ? 'dd-up' : ''}`}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={cursor >= 0 ? `${uid}-o${cursor}` : undefined}
            aria-labelledby={`${uid}-toggle`}
            style={{ ...menuStyle, pointerEvents: 'auto' }}
            onKeyDown={onMenuKey}
          >
            {filter && (
              <input ref={searchRef} className="dd-search" value={q}
                onChange={(e) => { setQ(e.target.value); setCursor(0) }}
                placeholder="Type to filter…" aria-label="Filter options" />
            )}
            <div ref={scrollRef} className="dd-scroll" role="presentation">
              {visible.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  id={`${uid}-o${i}`}
                  data-idx={i}
                  aria-selected={o.value === value}
                  className={`dd-option ${o.value === value ? 'selected' : ''} ${i === cursor ? 'cursor' : ''}`}
                  onPointerEnter={() => setCursor(i)}
                  onClick={() => pick(o.value)}
                  title={o.label}
                >
                  <span className="dd-option-text" style={{ pointerEvents: 'none' }}>
                    {renderOption ? renderOption(o) : null}
                    <span className="dd-option-label">{o.label}</span>
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
