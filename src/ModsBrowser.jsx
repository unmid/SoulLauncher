import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, fmtDownloads, openFileDialog } from './api.js'
import Dropdown from './Dropdown.jsx'
import { IconSearch, IconPlus, IconCheck, IconX, IconDownload, IconCube, IconBrush, IconSparkle, IconRefresh, IconRocket, IconLayers, IconWarn } from './icons.jsx'

const KINDS = [
  { id: 'mod', label: 'Mods', icon: IconCube },
  { id: 'resourcepack', label: 'Resource Packs', icon: IconBrush },
  { id: 'shader', label: 'Shaders', icon: IconSparkle },
  { id: 'datapack', label: 'Data Packs', icon: IconLayers },
  { id: 'modpack', label: 'Modpacks', icon: IconRocket },
]
const SOURCES = [
  { id: 'modrinth', label: 'Modrinth' },
  { id: 'curseforge', label: 'CurseForge' },
]
const PAGE_SIZE = 24

function installedRecord(items, source, projectId) {
  const stored = `${source}:${projectId}`
  return items.find((item) => (item.projectId || item.project_id) === stored || (item.projectId || item.project_id) === projectId) || null
}

export default function ModsBrowser({ mcVersion, loader, spacesModList = [], onPick, onUnpick, directSpaceId = null, onDirectChange, onSpaceCreated, notify }) {
  const [kind, setKind] = useState('mod')
  const [source, setSource] = useState('modrinth')
  const [query, setQuery] = useState('')
  const [versionFilter, setVersionFilter] = useState(mcVersion || '')
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [sort, setSort] = useState('relevance')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [relaxed, setRelaxed] = useState(false)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [directMods, setDirectMods] = useState(spacesModList)
  // datapack install target picker: {hit, worlds} | null
  const [datapackPick, setDatapackPick] = useState(null)
  const debounce = useRef(null)
  const listRef = useRef(null)
  // Monotonic id so a slow older search can never overwrite a newer one.
  const searchIdRef = useRef(0)

  useEffect(() => { setDirectMods(spacesModList || []) }, [directSpaceId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!directSpaceId) return
    let cancelled = false
    api.reconcileContent(directSpaceId)
      .then((space) => {
        if (!cancelled) setDirectMods(space.mods || [])
        onDirectChange?.()
      })
      .catch((e) => notify?.(`Couldn't check installed content: ${String(e)}`, 'error'))
    return () => { cancelled = true }
  }, [directSpaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setVersionFilter(mcVersion || '') }, [mcVersion])

  // Escape closes the datapack picker
  useEffect(() => {
    if (!datapackPick) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setDatapackPick(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [datapackPick])

  const modsBlocked = loader === 'vanilla' || loader === 'optifine'
  // Modpacks and datapacks are never blocked: packs build their own Space and
  // datapacks work in vanilla.
  const blocked = kind === 'mod' ? modsBlocked : kind === 'shader' ? loader === 'vanilla' : false
  const searchVersion = showAllVersions ? '' : (versionFilter.trim() || mcVersion || '')
  const targetVersion = versionFilter.trim() || mcVersion || ''
  const activeMods = directSpaceId ? directMods : spacesModList
  const isPackKind = kind === 'modpack'

  const doSearch = useCallback(async (q, s, off, k = kind, src = source) => {
    if (blocked) return
    const id = ++searchIdRef.current
    setLoading(true)
    setSearchError(null)
    try {
      const res = await api.searchContent({ source: src, kind: k, query: q, mcVersion: searchVersion, loader, sort: s, offset: off })
      if (id !== searchIdRef.current) return
      let hits = res.hits || []
      let totalHits = res.total || 0
      let didRelax = false
      // Modrinth authors rarely tag snapshot builds, so retry once without the
      // version facet before showing "nothing". CurseForge relaxes inside the
      // backend now.
      if (off === 0 && totalHits === 0 && searchVersion && src === 'modrinth' && !isPackKind && k !== 'datapack') {
        const retry = await api.searchContent({ source: src, kind: k, query: q, mcVersion: '', loader, sort: s, offset: 0 })
        if (id !== searchIdRef.current) return
        hits = retry.hits || []
        totalHits = retry.total || 0
        didRelax = hits.length > 0
      }
      setRelaxed(didRelax)
      // Pages replace results (the pager below navigates); never append.
      setResults(hits)
      setTotal(totalHits)
      setOffset(off)
    } catch (e) {
      if (id !== searchIdRef.current) return
      setSearchError(String(e))
      // Keep whatever results were visible; only page 0 failures clear them.
      if (off === 0) setResults([])
    } finally {
      if (id === searchIdRef.current) setLoading(false)
    }
  }, [blocked, kind, loader, searchVersion, source, isPackKind])

  useEffect(() => {
    setResults([])
    setTotal(0)
    setSearchError(null)
    doSearch(query, sort, 0)
  }, [doSearch, sort, kind, source, versionFilter, showAllVersions]) // eslint-disable-line react-hooks/exhaustive-deps

  const onQueryChange = (event) => {
    const value = event.target.value
    setQuery(value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(value, sort, 0), 350)
  }

  const createPackSpace = async (hit) => {
    setBusyId(hit.projectId)
    try {
      const space = await api.installModpack(source, hit.projectId, targetVersion || null)
      notify(`"${space.name}" (Minecraft ${space.mcVersion}) is being set up — watch its card fill up`)
      onSpaceCreated?.(space.id)
    } catch (e) {
      notify?.(String(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const installContentItem = async (sourceKind, hit, world = null) => {
    const record = installedRecord(activeMods, source, hit.projectId)
    if (!directSpaceId) {
      if (record) onUnpick?.(hit.projectId)
      else onPick?.({ projectId: hit.projectId, title: hit.title, iconUrl: hit.iconUrl, kind: sourceKind, source })
      return
    }
    setBusyId(hit.projectId)
    try {
      const updated = record
        ? await api.removeContent(directSpaceId, record.projectId || record.project_id)
        : await api.installContent(directSpaceId, { source, kind: sourceKind, projectId: hit.projectId })
      if (sourceKind === 'datapack' && !record && world) {
        const assigned = await api.assignDatapack(directSpaceId, `${source}:${hit.projectId}`, world)
        setDirectMods(assigned.mods || [])
      } else {
        setDirectMods(updated.mods || [])
      }
      notify?.(`${record ? 'Removed' : 'Added'} ${hit.title}`)
      onDirectChange?.()
    } catch (e) {
      notify?.(String(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const startDatapackInstall = async (hit) => {
    setBusyId(hit.projectId)
    let worlds = []
    try { worlds = directSpaceId ? await api.listSpaceWorlds(directSpaceId) : [] } catch { worlds = [] }
    setBusyId(null)
    if (!directSpaceId || worlds.length === 0) {
      installContentItem('datapack', hit, null)
      return
    }
    setDatapackPick({ hit, worlds })
  }

  const toggle = async (hit) => {
    if (kind === 'modpack') { createPackSpace(hit); return }
    if (kind === 'datapack') { startDatapackInstall(hit); return }
    const supported = !targetVersion || !hit.gameVersions?.length || hit.gameVersions.includes(targetVersion)
    if (!supported) {
      notify?.(`No support: ${hit.title} does not support Minecraft ${targetVersion}`, 'error')
      return
    }
    installContentItem(kind, hit)
  }

  const updateContent = async (hit) => {
    if (!directSpaceId) return
    setBusyId(hit.projectId)
    try {
      const updated = await api.installContent(directSpaceId, { source, kind, projectId: hit.projectId })
      setDirectMods(updated.mods || [])
      notify?.(`Updated ${hit.title}`)
      onDirectChange?.()
    } catch (e) {
      notify?.(String(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const uploadFiles = async () => {
    try {
      const picked = await openFileDialog({
        title: 'Add content files',
        filters: [{ name: 'Minecraft content', extensions: ['jar', 'zip', 'litemod'] }],
        multiple: true,
      })
      if (!picked) return
      const paths = Array.isArray(picked) ? picked : [picked]
      setBusyId('__upload')
      const updated = await api.importContentFiles(directSpaceId, paths)
      setDirectMods(updated.mods || [])
      notify(`Added ${paths.length} file${paths.length > 1 ? 's' : ''}`)
      onDirectChange?.()
    } catch (e) {
      notify?.(String(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDatapackWorld = async (world) => {
    const { hit } = datapackPick
    setDatapackPick(null)
    installContentItem('datapack', hit, world)
  }

  // --- pager (rendered above AND below the list) ---
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(totalPages, Math.floor(offset / PAGE_SIZE) + 1)
  const goPage = (p) => {
    const next = Math.max(1, Math.min(totalPages, p))
    doSearch(query, sort, (next - 1) * PAGE_SIZE)
    requestAnimationFrame(() => {
      try { listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } catch {}
    })
  }
  const pageWindow = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const keep = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages])
    const nums = [...keep].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
    const out = []
    nums.forEach((n, i) => {
      if (i > 0 && n - nums[i - 1] > 1) out.push('…')
      out.push(n)
    })
    return out
  })()
  const pager = totalPages > 1 ? (
    <div className="pager" role="navigation" aria-label="Result pages">
      <button className="pager-btn" disabled={page <= 1 || loading} onClick={() => goPage(page - 1)} title="Previous page">‹ Prev</button>
      {pageWindow.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="pager-ellipsis">…</span>
        : (
          <button key={n} className={`pager-btn ${n === page ? 'active' : ''}`} disabled={loading} onClick={() => goPage(n)} aria-current={n === page ? 'page' : undefined} title={`Page ${n}`}>
            {n}
          </button>
        ))}
      <button className="pager-btn" disabled={page >= totalPages || loading} onClick={() => goPage(page + 1)} title="Next page">Next ›</button>
      <span className="pager-count">Page {page} of {totalPages} · {total} found</span>
    </div>
  ) : null

  return (
    <div className="mods-browser">
      <div className="content-tabs">
        {KINDS.map((entry) => <button key={entry.id} className={`content-tab ${kind === entry.id ? 'active' : ''}`} onClick={() => setKind(entry.id)}><entry.icon size={17} /> {entry.label}</button>)}
        <div className="segment">
          {SOURCES.map((entry) => <button key={entry.id} className={`segment-btn ${source === entry.id ? 'active' : ''}`} onClick={() => setSource(entry.id)}>{entry.label}</button>)}
        </div>
      </div>

      {blocked ? (
        <div className="mods-empty">
          <div className="mods-empty-icon"><IconCube size={34} /></div>
          <div>This software choice cannot load mods.</div>
          <div className="mods-empty-sub">Pick Fabric, Quilt, Forge, NeoForge, or OptiFine as appropriate, then come back to add content.</div>
        </div>
      ) : (
        <>
          <div className="mods-toolbar">
            <div className="search-box"><IconSearch size={17} /><input value={query} onChange={onQueryChange} placeholder={`Search ${KINDS.find((entry) => entry.id === kind)?.label.toLowerCase()} on ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}...`} /></div>
            <label className="version-filter"><span>{isPackKind ? 'Pin MC' : 'Version'}</span><input value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)} placeholder="1.21.1" /></label>
            {!isPackKind && (
              <label className="version-all-toggle"><input type="checkbox" checked={showAllVersions} onChange={(event) => setShowAllVersions(event.target.checked)} /> All versions</label>
            )}
            {directSpaceId && (
              <button className="btn btn-secondary btn-small" onClick={uploadFiles} disabled={busyId === '__upload'} title="Add local .jar/.zip files to this Space">
                {busyId === '__upload' ? <span className="mini-spinner" /> : <IconPlus size={15} />} Add file…
              </button>
            )}
          </div>

          {isPackKind && (
            <div className="mods-note">
              {targetVersion
                ? <>Every pack you install is built for <strong>Minecraft {targetVersion}</strong> — the newest pack build that supports it, never a silent "latest". Packs with no build for it say so plainly.</>
                : <>Modpacks become their own new Space using each pack's own Minecraft version. Type one into “Pin MC” to force a specific version.</>}
            </div>
          )}
          {relaxed && results.length > 0 && (
            <div className="mods-note">Nothing is tagged for Minecraft {targetVersion} yet — showing all versions. Rows marked unsupported can't be installed.</div>
          )}
          {searchError && !loading && (
            <div className="mods-error" role="alert">
              <IconWarn size={16} />
              <span>{searchError}</span>
              <button className="btn btn-secondary btn-small" onClick={() => doSearch(query, sort, 0)}>Try again</button>
            </div>
          )}
          {pager}
          <div className="mods-list" ref={listRef}>
            {results.map((hit) => {
              const record = installedRecord(activeMods, source, hit.projectId)
              const picked = !!record
              const busy = busyId === hit.projectId
              const supported = isPackKind || kind === 'datapack' || !targetVersion || !hit.gameVersions?.length || hit.gameVersions.includes(targetVersion)
              // One button, always labeled: Add ⇄ Remove. No icon-only guessing.
              const actionLabel = isPackKind
                ? (busy ? <span className="mini-spinner" /> : <><IconRocket size={14} /> Install</>)
                : busy ? <span className="mini-spinner" />
                : picked ? <><IconCheck size={15} /> Remove</>
                : <><IconPlus size={15} /> Add</>
              return <div key={hit.projectId} className={`mod-row ${picked ? 'mod-row-picked' : ''} ${!supported ? 'mod-row-unsupported' : ''}`}>
                {hit.iconUrl ? <img className="mod-icon" src={hit.iconUrl} alt="" loading="lazy" /> : <div className="mod-icon mod-icon-fallback"><IconCube size={22} /></div>}
                <div className="mod-info">
                  <span className="mod-title">{hit.title}</span>
                  {picked && <span className="picked-flag"><IconCheck size={11} /> In your Space</span>}
                  <div className="mod-desc">{hit.description}</div>
                  <div className="mod-meta">
                    <span><IconDownload size={13} /> {fmtDownloads(hit.downloads)}</span>
                    {hit.author && <span>by {hit.author}</span>}
                    {record?.versionNumber && <span className="installed-version">Installed {record.versionNumber}</span>}
                    {record?.world && <span className="installed-version">in world “{record.world}”</span>}
                    {!supported && <span className="support-no">No support for {targetVersion}</span>}
                  </div>
                </div>
                <div className="mod-actions">
                  <button
                    className={`mod-add-btn ${isPackKind ? 'mod-add-btn-pack' : ''} ${picked ? 'mod-add-btn-remove' : ''}`}
                    disabled={busy || !supported}
                    onClick={() => toggle(hit)}
                    title={isPackKind ? 'Create a new Space from this pack' : picked ? `Remove ${hit.title} from this Space` : `Add ${hit.title} to this Space`}
                  >{actionLabel}</button>
                  {directSpaceId && picked && !isPackKind && kind !== 'datapack' && <button className="mod-add-btn mod-update-btn" disabled={busy || !supported} onClick={() => updateContent(hit)} title="Install the newest compatible version"><IconRefresh size={16} /></button>}
                </div>
              </div>
            })}
            {loading && results.length === 0 && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`sk${i}`} className="mod-row" aria-hidden="true">
                    <div className="mod-icon skeleton" />
                    <div className="mod-info">
                      <div className="skeleton skeleton-line" style={{ width: '38%' }} />
                      <div className="skeleton skeleton-line" style={{ width: '86%' }} />
                      <div className="skeleton skeleton-line" style={{ width: '24%' }} />
                    </div>
                    <div className="skeleton skeleton-btn" />
                  </div>
                ))}
              </>
            )}
            {loading && results.length > 0 && <div className="mods-loading"><span className="mini-spinner" /> Searching…</div>}
            {!loading && !searchError && results.length === 0 && <div className="mods-empty"><div className="mods-empty-icon"><IconSearch size={30} /></div><div>Nothing found{query ? ` for "${query}"` : ''}</div><div className="mods-empty-sub">Try another name, or enable All versions to inspect compatibility.</div></div>}
          </div>
          {pager}
        </>
      )}

      {datapackPick && createPortal(
        <div className="modal-backdrop" onClick={() => setDatapackPick(null)}>
          <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Where should “{datapackPick.hit.title}” go?</div>
            <div className="confirm-text">Data packs live inside a world. Pick one — or keep it in this Space's library for later.</div>
            <div className="datapack-choices">
              <button className="btn btn-secondary" onClick={() => confirmDatapackWorld(null)}>Keep in library</button>
              {datapackPick.worlds.map((w) => (
                <button key={w} className="btn" onClick={() => confirmDatapackWorld(w)}>{w}</button>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setDatapackPick(null)}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body,
      )}


    </div>
  )
}
