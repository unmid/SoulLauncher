import { useEffect, useMemo, useRef, useState } from 'react'
import { api, openFileDialog } from './api.js'
import SpaceCard from './SpaceCard.jsx'
import { IconPlus, IconGamepad, IconWarn, IconRocket, IconImport, IconLayers, IconCheck, IconX, IconEdit, IconTrash, IconCape } from './icons.jsx'

const CATEGORY_COLORS = ['#5eead4', '#38bdf8', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f87171', '#2dd4bf']

/* One category band: header + its Spaces as cards. Spaces can be dragged
   onto the band to join it; the header keeps rename/delete controls. */
function CategoryBand({ cat, spaces, progress, play, openWizard, refresh, notify, onDropSpace, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(cat.name)
  const [draftColor, setDraftColor] = useState(cat.color || CATEGORY_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dropHot, setDropHot] = useState(false)

  const saveEdit = async () => {
    setEditing(false)
    const name = draftName.trim()
    if (!name || (name === cat.name && draftColor === cat.color)) return
    try {
      await api.renameCategory(cat.id, name, draftColor)
      refresh()
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    setMenuOpen(false)
    try {
      await api.deleteCategory(cat.id)
      notify(`Category "${cat.name}" removed — its Spaces keep their files`)
      refresh()
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const onDragOver = (e) => {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropHot(true)
  }
  const onDrop = (e) => {
    e.preventDefault()
    setDropHot(false)
    const spaceId = e.dataTransfer.getData('text/soul-space')
    if (spaceId) onDropSpace(spaceId, cat.id)
  }

  return (
    <section
      className={`cat-band ${dropHot ? 'cat-hot' : ''}`}
      style={{ '--cat-color': cat.color || CATEGORY_COLORS[0] }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHot(false)}
      onDrop={onDrop}
    >
      <header className="cat-head">
        <span className="cat-dot" />
        {editing ? (
          <span className="cat-edit">
            <input
              className="input cat-name-input"
              value={draftName}
              maxLength={32}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') { setEditing(false); setDraftName(cat.name); setDraftColor(cat.color || CATEGORY_COLORS[0]) }
              }}
            />
            <span className="color-row">
              {CATEGORY_COLORS.map((c) => (
                <button key={c} className={`color-dot ${draftColor === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setDraftColor(c)} aria-label={`Color ${c}`} />
              ))}
            </span>
            <button className="icon-btn" onClick={saveEdit} title="Save"><IconCheck size={16} /></button>
            <button className="icon-btn" onClick={() => { setEditing(false); setDraftName(cat.name) }} title="Cancel"><IconX size={16} /></button>
          </span>
        ) : (
          <h2 className="cat-name">{cat.name}</h2>
        )}
        <span className="cat-count">{spaces.length}</span>
        <span className="cat-sub">auto-syncs servers &amp; settings</span>
        <button className="icon-btn" onClick={() => setEditing(true)} title="Rename category"><IconEdit size={15} /></button>
        <button className="icon-btn" onClick={() => setConfirmDelete(true)} title="Delete category"><IconTrash size={15} /></button>
        <button className="btn btn-secondary btn-small" onClick={() => openWizard({ mode: 'new', categoryId: cat.id })} title={`New Space in ${cat.name}`}>
          <IconPlus size={14} /> Add Space
        </button>
      </header>
      <div className="space-grid cat-grid">
        {spaces.map((space) => (
          <SpaceCard
            key={space.id}
            space={space}
            progress={progress[space.id]}
            onPlay={() => play(space)}
            onEdit={() => openWizard(space)}
            onChanged={refresh}
            onDeleted={refresh}
            notify={notify}
            draggable
          />
        ))}
        <button className="space-card space-add-card" onClick={() => openWizard({ mode: 'new', categoryId: cat.id })} title={`New Space in ${cat.name}`}>
          <IconPlus size={26} />
          <span className="space-add-label">New Space</span>
        </button>
        {spaces.length === 0 && (
          <div className="cat-empty">Drag Spaces here to group them — servers and settings stay in sync automatically.</div>
        )}
      </div>
      {confirmDelete && (
        <div className="confirm-pop" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="confirm-icon warn"><IconWarn size={28} /></div>
            <div className="confirm-title">Delete “{cat.name}”?</div>
            <div className="confirm-text">The category is unlinked. No Space or world files are deleted; each Space keeps its current settings.</div>
            <div className="confirm-actions">
              <button className="btn" autoFocus onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn btn-danger" onClick={doDelete}>Delete category</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default function LibraryPage({ spaces, progress, play, openWizard, refreshSpaces, notify }) {
  const [importWarn, setImportWarn] = useState(false)
  const [importing, setImporting] = useState(false)
  const [packBusy, setPackBusy] = useState(false)
  const [categories, setCategories] = useState([])
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0])
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)

  const refresh = async () => {
    try { setCategories(await api.listCategories()) } catch (e) { console.error(e) }
    refreshSpaces()
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const byCat = new Map(categories.map((c) => [c.id, []]))
    const uncat = []
    for (const s of spaces) {
      if (s.categoryId && byCat.has(s.categoryId)) byCat.get(s.categoryId).push(s)
      else uncat.push(s)
    }
    return { byCat, uncat }
  }, [spaces, categories])

  const startImport = () => setImportWarn(true)

  const doImport = async () => {
    setImportWarn(false)
    try {
      const path = await openFileDialog({
        title: 'Import a Space',
        filters: [{ name: 'Soul Space', extensions: ['json'] }],
        multiple: false,
      })
      if (!path) return
      setImporting(true)
      const space = await api.importSpace(path)
      notify(`Space "${space.name}" imported`)
      refreshSpaces()
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setImporting(false)
    }
  }

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

  const createCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    try {
      await api.createCategory(name, newCatColor)
      setNewCatOpen(false)
      setNewCatName('')
      setNewCatColor(CATEGORY_COLORS[(categories.length) % CATEGORY_COLORS.length])
      notify(`Category "${name}" created — drop Spaces into it`)
      refresh()
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const dropOnUncategorized = async (spaceId) => {
    try {
      await api.setSpaceCategory(spaceId, null)
      refresh()
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const dropOnCategory = async (spaceId, categoryId) => {
    const space = spaces.find((s) => s.id === spaceId)
    if (!space || space.categoryId === categoryId) return
    try {
      await api.setSpaceCategory(spaceId, categoryId)
      const cat = categories.find((c) => c.id === categoryId)
      notify(`"${space.name}" joined ${cat ? `"${cat.name}"` : 'the category'} — it now shares that group's settings & server list`)
      refresh()
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  return (
    <div
      className="page"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('text/soul-space')) {
          dragCounter.current += 1
          setDragging(true)
        }
      }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/soul-space')) e.preventDefault() }}
      onDragLeave={() => {
        dragCounter.current -= 1
        if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false) }
      }}
      onDrop={() => { dragCounter.current = 0; setDragging(false) }}
    >
      <div className="content-head">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-sub">Every Space is an isolated Minecraft. Categories group Spaces and keep them in sync automatically.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={() => setNewCatOpen(true)} title="A category shares options.txt and servers.dat across its Spaces">
            <IconLayers size={16} /> New category
          </button>
          <button className="btn btn-secondary" onClick={startImport} disabled={importing}>
            {importing ? <span className="mini-spinner" /> : <IconImport size={17} />} Import
          </button>
          <button className="btn btn-secondary" onClick={importModpack} disabled={packBusy} title="Install a .mrpack or CurseForge modpack zip as a new Space">
            {packBusy ? <span className="mini-spinner" /> : <IconRocket size={15} />} From modpack…
          </button>
          <button className="btn btn-primary" onClick={() => openWizard('new')}>
            <IconPlus size={17} /> New Space
          </button>
        </div>
      </div>

      {categories.map((cat) => (
        <CategoryBand
          key={cat.id}
          cat={cat}
          spaces={grouped.byCat.get(cat.id) || []}
          progress={progress}
          play={play}
          openWizard={openWizard}
          refresh={refresh}
          notify={notify}
          onDropSpace={dropOnCategory}
          dragging={dragging}
        />
      ))}

      {categories.length === 0 && (
        <section className="cat-banner">
          <IconCape size={22} />
          <div>
            <strong>Categories</strong> group Spaces together — in-game servers and settings then stay in sync across the group by themselves.
            Create one and drag Spaces in. No manual setup.
          </div>
          <button className="btn btn-primary btn-small" onClick={() => setNewCatOpen(true)}>
            <IconPlus size={14} /> Create a category
          </button>
        </section>
      )}

      {grouped.uncat.length > 0 && (
        <section
          className={`cat-band cat-uncat ${dragging && categories.length > 0 ? 'cat-hot-soft' : ''}`}
          onDragOver={(e) => {
            if (!dragging || categories.length === 0) return
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            const spaceId = e.dataTransfer.getData('text/soul-space')
            if (spaceId) dropOnUncategorized(spaceId)
          }}
        >
          {categories.length > 0 && (
            <header className="cat-head">
              <h2 className="cat-name">Ungrouped Spaces</h2>
              <span className="cat-count">{grouped.uncat.length}</span>
              <span className="cat-sub">each keeps its own settings</span>
            </header>
          )}
          <div className="space-grid cat-grid">
            {grouped.uncat.map((space) => (
              <SpaceCard
                key={space.id}
                space={space}
                progress={progress[space.id]}
                onPlay={() => play(space)}
                onEdit={() => openWizard(space)}
                onChanged={refresh}
                onDeleted={refresh}
                notify={notify}
                draggable
              />
            ))}
            {categories.length === 0 && (
              <button className="space-card space-add-card" onClick={() => openWizard('new')} title="New Space">
                <IconPlus size={26} />
                <span className="space-add-label">New Space</span>
              </button>
            )}
          </div>
        </section>
      )}

      {spaces.length === 0 && (
        <div className="empty-hero">
          <IconGamepad size={40} />
          <h2>Welcome to Soul</h2>
          <p>Make your first Space: choose a Minecraft version, attach a mod loader or OptiFine, and grab content with one click.</p>
          <button className="btn btn-primary btn-big" onClick={() => openWizard('new')}>
            <IconPlus size={17} /> Create my first Space
          </button>
        </div>
      )}

      {newCatOpen && (
        <div className="confirm-pop" onClick={() => setNewCatOpen(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New category">
            <div className="sheet-head">
              <div className="confirm-title">New category</div>
              <button className="icon-btn" onClick={() => setNewCatOpen(false)} title="Close"><IconX size={17} /></button>
            </div>
            <div className="confirm-text" style={{ textAlign: 'left' }}>
              Group Spaces so their in-game servers and settings stay in sync automatically.
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">Category name</label>
              <input
                className="input"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Family server nights"
                maxLength={32}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') createCategory() }}
              />
            </div>
            <div className="field">
              <label className="field-label">Color</label>
              <div className="color-row">
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} className={`color-dot ${newCatColor === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setNewCatColor(c)} aria-label={`Color ${c}`} />
                ))}
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setNewCatOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createCategory} disabled={!newCatName.trim()}>
                <IconPlus size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {importWarn && (
        <div className="confirm-pop" onClick={() => setImportWarn(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon warn"><IconWarn size={28} /></div>
            <div className="confirm-title">Import this Space?</div>
            <div className="confirm-text">
              Only import Space files from people you trust. The file describes a version and a list of content to download —
              everything else is blocked by the importer.
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setImportWarn(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doImport}>Choose file</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
