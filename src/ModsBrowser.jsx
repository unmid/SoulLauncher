import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, fmtDownloads, openFileDialog } from './api.js'
import Dropdown from './Dropdown.jsx'
import { IconSearch, IconPlus, IconCheck, IconX, IconDownload, IconCube, IconBrush, IconSparkle, IconRefresh, IconRocket, IconLayers, IconWarn, IconBack, IconExternal } from './icons.jsx'

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function renderDescription(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let html = raw
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    html = escapeHtml(raw)
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
    html = `<p>${html}</p>`
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set(['A', 'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'])
  doc.querySelectorAll('script, style, iframe, object, embed, form, input, button, video, audio, svg').forEach((node) => node.remove())
  doc.querySelectorAll('*').forEach((node) => {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes)
      return
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      const keep = (node.tagName === 'A' && ['href', 'title'].includes(name)) || (node.tagName === 'IMG' && ['src', 'alt', 'title'].includes(name))
      if (!keep) node.removeAttribute(attr.name)
    }
    if (node.tagName === 'A' && node.getAttribute('href') && !/^https?:/i.test(node.getAttribute('href'))) node.removeAttribute('href')
    if (node.tagName === 'IMG' && node.getAttribute('src') && !/^https:\/\//i.test(node.getAttribute('src'))) node.remove()
  })
  return doc.body.innerHTML
}

function installedRecord(items, source, projectId) {
  const stored = `${source}:${projectId}`
  return items.find((item) => (item.projectId || item.project_id) === stored || (item.projectId || item.project_id) === projectId) || null
}

const MODPAGE_VIEWER = 'https://unmid.github.io/SoulLauncher/modpage.html'
const MODRINTH_ROUTES = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  modpack: 'modpack',
}

function modrinthRoute(kind) {
  return MODRINTH_ROUTES[kind] || 'mod'
}

function ProjectPagePopup({
  details,
  detailsBusy,
  detailsError,
  detailsIcon,
  detailsMarkup,
  detailsVersions,
  detailsLoaders,
  detailsCategories,
  source,
  kind,
  isPackKind,
  targetVersion,
  blocked,
  busyId,
  activeMods,
  detailsUnsupported,
  onClose,
  onToggle,
}) {
  const [mode, setMode] = useState(source === 'curseforge' ? 'details' : 'page')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [frameTimedOut, setFrameTimedOut] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const frameLoadedRef = useRef(false)
  const projectId = details?.projectId || ''
  const route = modrinthRoute(kind)
  // Keep the first project reference for the embedded viewer. The API response
  // arrives a moment later with a prettier slug; swapping the frame source
  // then would needlessly reload the page the user is already reading.
  const [initialProjectRef] = useState(details?.slug || details?.projectId || projectId)
  const viewerUrl = `${MODPAGE_VIEWER}?source=modrinth&project=${encodeURIComponent(initialProjectRef)}&kind=${route}`
  const canonicalUrl = source === 'modrinth'
    ? `https://modrinth.com/${route}/${encodeURIComponent(details?.slug || details?.projectId || projectId)}`
    : (details?.pageUrl || '')
  const record = installedRecord(activeMods, source, projectId)
  const installed = !!record && !isPackKind
  const disabled = busyId === projectId || detailsUnsupported
  const showFrame = source === 'modrinth' && mode === 'page' && !frameTimedOut

  useEffect(() => {
    if (!showFrame) return undefined
    frameLoadedRef.current = false
    setFrameLoaded(false)
    // Cross-origin iframes do not reliably report blocking or DNS failures.
    // If nothing renders in a reasonable time, use the native details view.
    const timer = setTimeout(() => {
      if (!frameLoadedRef.current) setFrameTimedOut(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [showFrame, viewerUrl, frameKey])

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="page-popup" role="dialog" aria-modal="true" aria-label={details.title} onClick={(event) => event.stopPropagation()}>
        <div className="page-popup-toolbar">
          <button className="page-back" onClick={onClose} title="Back to results (Esc)">
            <IconBack size={15} /> Back
          </button>
          <div className="page-popup-identity">
            {detailsIcon
              ? <img src={detailsIcon} alt="" />
              : <div className="details-icon-fallback" style={{ width: 38, height: 38, borderRadius: 10 }}><IconCube size={20} /></div>}
            <div style={{ minWidth: 0 }}>
              <div className="page-popup-title">{details.title}</div>
              <div className="page-popup-sub">
                {details.author ? `${details.author} · ` : ''}{source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
              </div>
            </div>
          </div>
          <div className="page-popup-actions">
            {source === 'modrinth' && (
              <div className="segment" role="tablist" aria-label="Page view">
                <button className={`segment-btn ${mode === 'page' ? 'active' : ''}`} onClick={() => setMode('page')}>Page</button>
                <button className={`segment-btn ${mode === 'details' ? 'active' : ''}`} onClick={() => setMode('details')}>Details</button>
              </div>
            )}
            {!blocked && (
              <button
                className={`mod-add-btn ${isPackKind ? 'mod-add-btn-pack' : ''} ${installed ? 'mod-add-btn-picked' : ''}`}
                disabled={disabled}
                onClick={onToggle}
                title={isPackKind ? 'Create a new Space from this pack' : installed ? 'Remove from Space' : 'Add to Space'}
              >
                {busyId === projectId
                  ? <span className="mini-spinner" />
                  : isPackKind
                    ? <><IconRocket size={14} /> {targetVersion ? `Create Space · ${targetVersion}` : 'New Space'}</>
                    : installed
                      ? <><IconCheck size={15} /> Remove</>
                      : <><IconPlus size={15} /> Add</>}
              </button>
            )}
            {canonicalUrl && (
              <button className="icon-btn" onClick={() => api.openUrl(canonicalUrl)} title={`Open the full ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'} page`}>
                <IconExternal size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose} title="Close (Esc)"><IconX size={17} /></button>
          </div>
        </div>

        {showFrame ? (
          <div className="page-frame-wrap">
            {!frameLoaded && (
              <div className="page-loading" role="status">
                <span className="mini-spinner" /> Loading the live {source === 'modrinth' ? 'Modrinth' : 'project'} page…
              </div>
            )}
            <iframe
              key={`${viewerUrl}#${frameKey}`}
              className="page-frame"
              src={viewerUrl}
              title={`${details.title} on ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}`}
              referrerPolicy="no-referrer"
              allow="fullscreen"
              onLoad={() => { frameLoadedRef.current = true; setFrameLoaded(true); }}
              onError={() => setFrameTimedOut(true)}
            />
          </div>
        ) : (
          <ProjectDetailsFallback
            details={details}
            detailsBusy={detailsBusy}
            detailsError={detailsError}
            detailsIcon={detailsIcon}
            detailsMarkup={detailsMarkup}
            detailsVersions={detailsVersions}
            detailsLoaders={detailsLoaders}
            detailsCategories={detailsCategories}
            source={source}
            kind={kind}
            isPackKind={isPackKind}
            targetVersion={targetVersion}
            detailsUnsupported={detailsUnsupported}
            frameTimedOut={frameTimedOut && source === 'modrinth'}
            onShowPage={source === 'modrinth' ? () => { setFrameTimedOut(false); setFrameKey((n) => n + 1); setMode('page') } : null}
            blocked={blocked}
            disabled={disabled}
            installed={installed}
            busyId={busyId}
            projectId={projectId}
            onToggle={onToggle}
            onRetry={onRetry}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

function ProjectDetailsFallback({
  details,
  detailsBusy,
  detailsError,
  detailsIcon,
  detailsMarkup,
  detailsVersions,
  detailsLoaders,
  detailsCategories,
  source,
  isPackKind,
  targetVersion,
  detailsUnsupported,
  frameTimedOut,
  onShowPage,
  blocked,
  disabled,
  installed,
  busyId,
  projectId,
  onToggle,
  onRetry,
  onClose,
}) {
  return (
    <div className="page-fallback">
      <div className="details-head" style={{ padding: 0, border: 0 }}>
        {detailsIcon
          ? <img src={detailsIcon} alt="" className="details-icon" />
          : <div className="details-icon details-icon-fallback"><IconCube size={26} /></div>}
        <div className="details-heading">
          <h2>{details.title}</h2>
          <div className="details-byline">
            {details.author && <span className="details-author">{details.author}</span>}
            <span className="details-source">{source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
          </div>
        </div>
      </div>

      <div className="details-meta" style={{ padding: '14px 0 2px' }}>
        <span className="details-pill"><IconDownload size={12} /> {fmtDownloads(details.downloads)} downloads</span>
        {!isPackKind && (
          <span className={`details-support ${detailsUnsupported ? 'unsupported' : ''}`}>
            {detailsUnsupported
              ? `No support for Minecraft ${targetVersion}`
              : `Supports Minecraft ${targetVersion || 'the selected version'}`}
          </span>
        )}
      </div>

      {frameTimedOut && (
        <div className="page-fallback-note">
          <strong>The live page would not load here.</strong> You are seeing the built-in project details instead.
          {onShowPage && <> <button className="btn btn-ghost btn-small" onClick={onShowPage}>Try the page again</button></>}
        </div>
      )}
      {source === 'curseforge' && (
        <div className="page-fallback-note">
          <strong>CurseForge does not allow its pages to be embedded.</strong> This built-in view has the description, versions,
          loaders, and install actions; use the open icon above for the full CurseForge page.
        </div>
      )}

      {details.description && detailsMarkup !== details.description && (
        <p className="page-fallback-lead">{details.description}</p>
      )}
      {detailsBusy ? (
        <div className="details-skel">
          <div className="skeleton skeleton-line" style={{ width: '92%' }} />
          <div className="skeleton skeleton-line" style={{ width: '98%' }} />
          <div className="skeleton skeleton-line" style={{ width: '64%' }} />
          <div className="skeleton skeleton-line" style={{ width: '85%' }} />
          <div className="skeleton skeleton-line" style={{ width: '41%' }} />
        </div>
      ) : detailsError ? (
        <div className="details-error">
          <IconWarn size={26} />
          <div>Couldn't load the full description.<br /><span style={{ color: 'var(--faint)', fontSize: 12 }}>{detailsError.slice(0, 120)}</span></div>
          <button className="btn btn-secondary btn-small" onClick={onRetry}><IconRefresh size={13} /> Try again</button>
        </div>
      ) : (
        <div className="details-body details-rendered" style={{ padding: '10px 0 0', overflow: 'visible' }} dangerouslySetInnerHTML={{ __html: detailsMarkup || '<p>No description provided.</p>' }} />
      )}

      {detailsLoaders.length > 0 && (
        <div className="details-section">
          <div className="details-section-title">Software</div>
          <div className="details-chips">
            {detailsLoaders.map((l) => <span key={l} className="details-chip loader">{l}</span>)}
          </div>
        </div>
      )}

      {detailsVersions.length > 0 && (
        <div className="details-section">
          <div className="details-section-title">Minecraft versions</div>
          <div className="details-chips">
            {detailsVersions.slice(0, 18).map((v) => <span key={v} className="details-chip">{v}</span>)}
            {detailsVersions.length > 18 && <span className="details-chip more">+{detailsVersions.length - 18} more</span>}
          </div>
        </div>
      )}

      {detailsCategories.length > 0 && (
        <div className="details-section">
          <div className="details-section-title">Categories</div>
          <div className="details-chips">
            {detailsCategories.map((c) => <span key={c} className="details-chip">{c}</span>)}
          </div>
        </div>
      )}

      <div className="details-foot" style={{ padding: '18px 0 4px', background: 'transparent', borderTop: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Back</button>
        {!blocked && (
          <button
            className={`btn btn-primary ${installed && !isPackKind ? 'btn-picked' : ''}`}
            disabled={disabled}
            onClick={onToggle}
          >
            {busyId === projectId
              ? <span className="mini-spinner" />
              : isPackKind
                ? <><IconRocket size={15} /> {targetVersion ? `Create Space · ${targetVersion}` : 'Create Space from pack'}</>
                : installed
                  ? <><IconCheck size={16} /> Remove from Space</>
                  : <><IconPlus size={16} /> Add to Space</>}
          </button>
        )}
      </div>
    </div>
  )
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
  const [details, setDetails] = useState(null)
  const [detailsBusy, setDetailsBusy] = useState(false)
  const [detailsError, setDetailsError] = useState(null)
  const [directMods, setDirectMods] = useState(spacesModList)
  // datapack install target picker: {hit, worlds} | null
  const [datapackPick, setDatapackPick] = useState(null)
  const debounce = useRef(null)
  const detailsRef = useRef(null)
  // Monotonic id so a slow older search can never overwrite a newer one.
  const searchIdRef = useRef(0)

  // Fresh state for every preview: reset scroll + selection helpers.
  useEffect(() => {
    if (!details) return
    detailsRef.current?.scrollTo({ top: 0 })
  }, [details])

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

  // Escape closes any open dialog (details / datapack picker)
  useEffect(() => {
    if (!details && !datapackPick) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setDetails(null); setDatapackPick(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [details, datapackPick])

  const modsBlocked = loader === 'vanilla' || loader === 'optifine'
  // Modpacks and datapacks are never blocked: packs build their own Space and
  // datapacks work in vanilla.
  const blocked = kind === 'mod' ? modsBlocked : kind === 'shader' ? loader === 'vanilla' : false
  const searchVersion = showAllVersions ? '' : (versionFilter.trim() || mcVersion || '')
  const targetVersion = versionFilter.trim() || mcVersion || ''
  const activeMods = directSpaceId ? directMods : spacesModList
  const detailsMarkup = useMemo(() => renderDescription(details?.body || details?.description), [details])
  const detailsVersions = details?.gameVersions || details?.game_versions || []
  const detailsLoaders = details?.loaders || []
  const detailsCategories = details?.categories || []
  const detailsIcon = details?.iconUrl || details?.icon_url || ''
  const isPackKind = kind === 'modpack'
  const detailsUnsupported =
    !isPackKind && kind !== 'datapack' &&
    detailsVersions.length > 0 && targetVersion && !detailsVersions.includes(targetVersion)

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
      if (off === 0) setResults(hits)
      else setResults((current) => [...current, ...hits])
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

  const openDetails = async (hit) => {
    setDetails({ ...hit, body: hit.description || '' })
    setDetailsBusy(true)
    setDetailsError(null)
    try {
      setDetails(await api.getContentDetails({ source, projectId: hit.projectId }))
    } catch (e) {
      setDetailsError(String(e))
    } finally {
      setDetailsBusy(false)
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

  return (
    <div className="mods-browser">
      <div className="content-tabs">
        {KINDS.map((entry) => <button key={entry.id} className={`content-tab ${kind === entry.id ? 'active' : ''}`} onClick={() => setKind(entry.id)}><entry.icon size={15} /> {entry.label}</button>)}
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
            <div className="search-box"><IconSearch size={16} /><input value={query} onChange={onQueryChange} placeholder={`Search ${KINDS.find((entry) => entry.id === kind)?.label.toLowerCase()} on ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}...`} /></div>
            <label className="version-filter"><span>{isPackKind ? 'Pin MC' : 'Version'}</span><input value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)} placeholder="1.21.1" /></label>
            {!isPackKind && (
              <label className="version-all-toggle"><input type="checkbox" checked={showAllVersions} onChange={(event) => setShowAllVersions(event.target.checked)} /> All versions</label>
            )}
            {directSpaceId && (
              <button className="btn btn-secondary btn-small" onClick={uploadFiles} disabled={busyId === '__upload'} title="Add local .jar/.zip files to this Space">
                {busyId === '__upload' ? <span className="mini-spinner" /> : <IconPlus size={14} />} Add file…
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
          <div className="mods-list">
            {results.map((hit) => {
              const record = installedRecord(activeMods, source, hit.projectId)
              const picked = !!record
              const supported = isPackKind || kind === 'datapack' || !targetVersion || !hit.gameVersions?.length || hit.gameVersions.includes(targetVersion)
              const actionLabel = isPackKind
                ? (busyId === hit.projectId ? <span className="mini-spinner" /> : <><IconRocket size={13} /> {targetVersion ? `Install · ${targetVersion}` : 'New Space'}</>)
                : busyId === hit.projectId ? <span className="mini-spinner" /> : picked ? <IconCheck size={16} /> : <IconPlus size={16} />
              return <div key={hit.projectId} className={`mod-row ${picked ? 'mod-row-picked' : ''} ${!supported ? 'mod-row-unsupported' : ''}`}>
                {hit.iconUrl ? <img className="mod-icon" src={hit.iconUrl} alt="" loading="lazy" /> : <div className="mod-icon mod-icon-fallback"><IconCube size={18} /></div>}
                <div className="mod-info">
                  <button className="mod-title mod-title-button" onClick={() => openDetails(hit)} title="Show description">{hit.title}</button>
                  <div className="mod-desc">{hit.description}</div>
                  <div className="mod-meta">
                    <span><IconDownload size={12} /> {fmtDownloads(hit.downloads)}</span>
                    {hit.author && <span>- {hit.author}</span>}
                    {record?.versionNumber && <span className="installed-version">Installed {record.versionNumber}</span>}
                    {record?.world && <span className="installed-version">in world “{record.world}”</span>}
                    {!supported && <span className="support-no">No support for {targetVersion}</span>}
                  </div>
                </div>
                <div className="mod-actions">
                  <button
                    className={`mod-add-btn ${isPackKind ? 'mod-add-btn-pack' : ''} ${picked ? 'mod-add-btn-picked' : ''}`}
                    disabled={busyId === hit.projectId || !supported}
                    onClick={() => toggle(hit)}
                    title={isPackKind ? 'Create a new Space from this pack' : picked ? 'Remove from Space' : 'Add to Space'}
                  >{actionLabel}</button>
                  {directSpaceId && picked && !isPackKind && kind !== 'datapack' && <button className="mod-add-btn mod-update-btn" disabled={busyId === hit.projectId || !supported} onClick={() => updateContent(hit)} title="Install the newest compatible version"><IconRefresh size={15} /></button>}
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
          {results.length > 0 && results.length < total && !loading && <button className="btn btn-ghost mods-more" onClick={() => doSearch(query, sort, offset + 24)}>Show more ({results.length} of {total})</button>}
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

      {details && (
        <ProjectPagePopup
          key={`${source}:${details.projectId}`}
          details={details}
          detailsBusy={detailsBusy}
          detailsError={detailsError}
          detailsIcon={detailsIcon}
          detailsMarkup={detailsMarkup}
          detailsVersions={detailsVersions}
          detailsLoaders={detailsLoaders}
          detailsCategories={detailsCategories}
          source={source}
          kind={kind}
          isPackKind={isPackKind}
          targetVersion={targetVersion}
          blocked={blocked}
          busyId={busyId}
          activeMods={activeMods}
          detailsUnsupported={detailsUnsupported}
          onClose={() => setDetails(null)}
          onToggle={() => toggle({ ...details, gameVersions: detailsVersions, iconUrl: detailsIcon })}
          onRetry={() => openDetails(details)}
        />
      )}
    </div>
  )
}
