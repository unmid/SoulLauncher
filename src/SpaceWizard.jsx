import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import ModsBrowser from './ModsBrowser.jsx'
import Dropdown from './Dropdown.jsx'
import { LOADER_META, LoaderMark, SPACE_ICONS, SpaceIcon, SPACE_COLORS, IconCheck, IconSearch, IconX, IconPlus, IconLayers } from './icons.jsx'

const STEPS = ['Game', 'Software', 'Content', 'Create']
const VERSION_CACHE_KEY = 'soul.versions.v1'

function readVersionCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(VERSION_CACHE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

/**
 * New-Space / Edit-Space popup, rebuilt simple:
 * 4 slim steps, plain language, every step escapable offline
 * (cached versions, manual version typing, latest-loader fallback,
 * inline category creation). No global Enter hijack — Esc closes.
 */
export default function SpaceWizard({ existing = null, initialLoader = null, initialCategoryId = null, settings, onClose, onSaved, onSpaceCreated, notify }) {
  const isEdit = !!existing
  const [step, setStep] = useState(0)

  // --- game version (offline-proof) ---
  const [versions, setVersions] = useState(null) // null = loading
  const [versionsStale, setVersionsStale] = useState(false)
  const [installed, setInstalled] = useState(new Set())
  const [versionFilter, setVersionFilter] = useState('')
  const [versionKind, setVersionKind] = useState('release')
  const [mcVersion, setMcVersion] = useState(existing?.mcVersion || '')

  // --- software ---
  const [loader, setLoader] = useState(existing?.loader || initialLoader || 'fabric')
  const [loaderVersion, setLoaderVersion] = useState(existing?.loaderVersion || null)
  const [loaderVersions, setLoaderVersions] = useState([])
  const [loaderBusy, setLoaderBusy] = useState(false)
  const [loaderFailed, setLoaderFailed] = useState(false)
  const [manualLoader, setManualLoader] = useState('')
  const [soulBuilds, setSoulBuilds] = useState([])
  const [soulVersion, setSoulVersion] = useState(null)
  const [soulFailed, setSoulFailed] = useState(false)

  // --- content + identity ---
  const [picked, setPicked] = useState([])
  const [name, setName] = useState(existing?.name || '')
  const [icon, setIcon] = useState(existing?.icon || 'crafting-table')
  const [color, setColor] = useState(existing?.color || '#5eead4')
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState(existing?.categoryId || initialCategoryId || null)
  const [newCatName, setNewCatName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false

  useEffect(() => {
    api.listGameVersions()
      .then((v) => {
        setVersions(v)
        try { localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(v)) } catch {}
      })
      .catch(() => {
        const cached = readVersionCache()
        setVersions(cached)
        setVersionsStale(true)
        if (!cached.length) notify('No internet — type any Minecraft version below', 'error')
      })
    api.listInstalledVersions().then((v) => setInstalled(new Set(v))).catch(() => {})
    api.listCategories().then(setCategories).catch(() => {})
    if (existing) return
    api.listSoulClients()
      .then((list) => {
        const builds = Array.isArray(list) ? list : []
        setSoulBuilds(builds)
        if (builds.length > 0) setSoulVersion((cur) => cur || builds[0].id)
        else setSoulFailed(true)
      })
      .catch(() => setSoulFailed(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (existing || initialLoader !== 'soul' || soulBuilds.length === 0) return
    setLoader('soul')
    setIcon('soul')
    setColor('#5eead4')
    if (!soulVersion) setSoulVersion(soulBuilds[0].id)
  }, [existing, initialLoader, soulBuilds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mcVersion || loader === 'vanilla' || loader === 'soul') {
      setLoaderVersions([]); setLoaderVersion(null); setLoaderBusy(false); setLoaderFailed(false)
      return
    }
    let cancelled = false
    setLoaderBusy(true)
    setLoaderFailed(false)
    api.listLoaderVersions(loader, mcVersion)
      .then((list) => {
        if (cancelled) return
        setLoaderVersions(list)
        setLoaderVersion((cur) => (list.includes(cur) ? cur : list[0] || null))
        setLoaderFailed(list.length === 0)
        setLoaderBusy(false)
      })
      .catch(() => { if (!cancelled) { setLoaderVersions([]); setLoaderVersion(null); setLoaderFailed(true); setLoaderBusy(false) } })
    return () => { cancelled = true }
  }, [mcVersion, loader]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedSoul = useMemo(() => soulBuilds.find((b) => b.id === soulVersion) || null, [soulBuilds, soulVersion])
  const kindOf = (v) => String(v.kind || v.type || '').toLowerCase().replace(/-/g, '_')
  const filteredVersions = useMemo(() => {
    if (!versions) return []
    const q = versionFilter.trim().toLowerCase()
    let list = q ? versions.filter((v) => v.id.toLowerCase().includes(q)) : versions
    if (versionKind === 'classic') list = list.filter((v) => ['old_beta', 'old_alpha'].includes(kindOf(v)))
    else if (versionKind !== 'all') list = list.filter((v) => kindOf(v) === versionKind)
    return list.slice().sort((a, b) => Number(installed.has(b.id)) - Number(installed.has(a.id)))
  }, [versions, versionFilter, versionKind, installed])

  const needLoaderVer = loader !== 'vanilla' && loader !== 'soul'
  const effLoaderVersion = loaderVersion || manualLoader.trim() || null

  const stepHint = [
    !mcVersion ? 'Pick a Minecraft version to continue' : '',
    loader === 'soul' && !selectedSoul ? 'Soul Client needs internet — pick another software for now' : '',
    '',
    !name.trim() ? 'Give your Space a name to finish' : '',
  ]
  const canNext =
    step === 0 ? !!mcVersion :
    step === 1 ? !(loader === 'soul' && !selectedSoul) :
    step === 2 ? true :
    name.trim().length > 0

  const chooseLoader = (key) => {
    setLoader(key)
    setLoaderVersion(null)
    setManualLoader('')
    if (key === 'soul') {
      const build = selectedSoul || soulBuilds[0] || null
      if (build) {
        setSoulVersion(build.id)
        if (build.mcVersion) setMcVersion(build.mcVersion)
        setIcon('soul')
        setColor('#5eead4')
      }
    }
  }

  const createCategoryInline = async () => {
    const clean = newCatName.trim()
    if (!clean) return
    try {
      const cat = await api.createCategory(clean, '#5eead4')
      setCategories((c) => [...c, cat])
      setCategoryId(cat.id)
      setNewCatName('')
      notify(`Category "${cat.name}" created`)
    } catch (e) { notify(String(e), 'error') }
  }

  const pick = (item) => setPicked((m) => [...m, item])
  const unpick = (id) => setPicked((m) => m.filter((x) => x.projectId !== id))

  const save = async () => {
    setSaving(true)
    try {
      if (loader === 'soul' && !isEdit) {
        if (!selectedSoul) throw new Error('Pick a Soul Client build first.')
        setSaveMsg(`Installing ${selectedSoul.name}…`)
        const built = await api.installSoulClient(selectedSoul.id)
        onSpaceCreated?.(built.id)
        notify(`"${built.name}" is being set up — watch its card fill up`)
        onClose()
        return
      }
      const finalCategoryId = categoryId && categoryId !== '__new__' ? categoryId : null
      if (isEdit) {
        await api.updateSpace({ ...existing, name: name.trim(), icon, color, mcVersion, loader, loaderVersion: loader === 'vanilla' ? null : effLoaderVersion, categoryId: finalCategoryId })
        await api.setSpaceCategory(existing.id, finalCategoryId).catch(() => {})
        onSaved()
        notify('Space updated')
        onClose()
        return
      }
      setSaveMsg('Creating your Space…')
      const created = await api.createSpace({
        id: '', name: name.trim(), icon, color, mcVersion, loader,
        loaderVersion: loader === 'vanilla' ? null : effLoaderVersion,
        installedVersionId: null, mods: [], createdAt: 0, lastPlayed: null, ramGb: null,
      })
      if (finalCategoryId) {
        await api.setSpaceCategory(created.id, finalCategoryId).catch((e) => notify(`Couldn't join the category: ${String(e).slice(0, 80)}`, 'error'))
      }
      for (let i = 0; i < picked.length; i++) {
        setSaveMsg(`Adding content… ${i + 1}/${picked.length}`)
        const p = picked[i]
        try {
          await api.installContent(created.id, { source: p.source, kind: p.kind, projectId: p.projectId })
        } catch (e) {
          notify(`Couldn't add ${p.title}: ${String(e).slice(0, 80)}`, 'error')
        }
      }
      if (picked.length > 0) notify(`Space created with ${picked.length} item${picked.length > 1 ? 's' : ''}`)
      else notify('Space created — press Play')
      onSaved()
      onClose()
    } catch (e) {
      notify(String(e), 'error')
      setSaving(false)
      setSaveMsg('')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="wizard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit Space' : 'New Space'}>
        <div className="wizard-head">
          <div className="wizard-head-text">
            <div className="wizard-title">{isEdit ? 'Edit Space' : 'New Space'}</div>
            <div className="wizard-sub">Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)"><IconX size={18} /></button>
        </div>

        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`wizard-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <span className="wizard-dot">{i < step ? <IconCheck size={11} /> : i + 1}</span>
              <span className="wizard-step-label">{label}</span>
            </div>
          ))}
        </div>

        {(offline || versionsStale) && (
          <div className="offline-note" style={{ margin: '14px 24px 0' }}>
            You're offline — cached versions shown. Type any version manually; downloads wait for internet.
          </div>
        )}

        <div className="wizard-body">
          {step === 0 && (
            <div className="wizard-page">
              <div className="wizard-tools">
                <div className="search-box wizard-search">
                  <IconSearch size={16} />
                  <input value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)} placeholder="Search versions… try “1.21”" />
                </div>
                <Dropdown
                  value={versionKind}
                  onChange={setVersionKind}
                  options={[
                    { value: 'release', label: 'Releases' },
                    { value: 'snapshot', label: 'Snapshots' },
                    { value: 'classic', label: 'Classic' },
                    { value: 'all', label: 'Everything' },
                  ]}
                />
              </div>
              {!versions ? (
                <div className="version-list">
                  {Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 41, borderRadius: 10 }} />)}
                </div>
              ) : filteredVersions.length > 0 ? (
                <div className="version-list">
                  {filteredVersions.map((v) => (
                    <button key={v.id + v.kind} className={`version-row ${mcVersion === v.id ? 'selected' : ''}`} onClick={() => setMcVersion(v.id)}>
                      <span className="version-row-id">{v.id}</span>
                      {installed.has(v.id) && <span className="installed-badge">installed</span>}
                      {kindOf(v) !== 'release' && <span className="version-chip-kind">{kindOf(v) === 'snapshot' ? 'snapshot' : 'classic'}</span>}
                      {mcVersion === v.id && <span className="version-row-check"><IconCheck size={15} /></span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="wizard-none">No matches — type the version below instead.</div>
              )}
              <div className="field" style={{ marginTop: 4, marginBottom: 0 }}>
                <label className="field-label">Or type any version</label>
                <input className="input" value={versions?.some((v) => v.id === mcVersion) ? '' : mcVersion} onChange={(e) => setMcVersion(e.target.value.trim())} placeholder="e.g. 1.21.1" maxLength={40} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="wizard-page">
              <button type="button" className={`soul-client-card ${loader === 'soul' ? 'selected' : ''}`} onClick={() => chooseLoader('soul')} disabled={soulFailed && soulBuilds.length === 0} aria-pressed={loader === 'soul'}>
                <span className="soul-client-mark"><LoaderMark.soul size={32} /></span>
                <span className="soul-client-text">
                  <span className="loader-label">Soul Client</span>
                  <span className="loader-desc">{LOADER_META.soul.desc}</span>
                  <span className="soul-client-meta">
                    {soulFailed ? 'Needs internet — pick another software for now' : selectedSoul ? `${selectedSoul.name} · Minecraft ${selectedSoul.mcVersion}` : 'Checking builds…'}
                  </span>
                </span>
                {loader === 'soul' && <span className="version-row-check"><IconCheck size={16} /></span>}
              </button>
              {loader === 'soul' && !soulFailed && soulBuilds.length > 0 && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Client build</label>
                  <Dropdown
                    value={soulVersion}
                    onChange={(id) => {
                      setSoulVersion(id)
                      const build = soulBuilds.find((b) => b.id === id)
                      if (build?.mcVersion) setMcVersion(build.mcVersion)
                    }}
                    options={soulBuilds.map((b) => ({ value: b.id, label: `${b.name} · Minecraft ${b.mcVersion}`, hint: b.modCount ? `${b.modCount} mods` : undefined }))}
                  />
                </div>
              )}
              <div className="loader-grid">
                {Object.entries(LOADER_META).filter(([key]) => key !== 'soul').map(([key, meta]) => {
                  const Mark = LoaderMark[key] || LoaderMark.vanilla
                  return (
                    <button key={key} className={`loader-card ${loader === key ? 'selected' : ''}`} onClick={() => chooseLoader(key)}>
                      <span className="loader-mark"><Mark size={28} /></span>
                      <span className="loader-card-text">
                        <span className="loader-label">{meta.label}</span>
                        <span className="loader-desc">{meta.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {needLoaderVer && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">{LOADER_META[loader]?.label} version <span className="field-optional">— empty = latest</span></label>
                  {loaderBusy ? (
                    <div className="loading-line"><span className="mini-spinner" /> Checking versions…</div>
                  ) : loaderVersions.length > 0 ? (
                    <Dropdown
                      value={loaderVersion}
                      onChange={setLoaderVersion}
                      options={loaderVersions.map((v, i) => ({ value: v, label: v, hint: i === 0 ? 'recommended' : undefined }))}
                      filter={loaderVersions.length > 10}
                      renderOption={() => { const M = LoaderMark[loader] || LoaderMark.vanilla; return <M size={20} /> }}
                      renderValue={(o) => { const M = LoaderMark[loader] || LoaderMark.vanilla; return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><M size={20} />{o.label}</span> }}
                    />
                  ) : (
                    <>
                      <input className="input" value={manualLoader} onChange={(e) => setManualLoader(e.target.value.trim())} placeholder={loaderFailed ? 'Offline — leave empty for latest, or type one' : `No ${LOADER_META[loader]?.label} build for ${mcVersion} yet — type one or go Back`} maxLength={40} />
                      <div className="field-hint">Leave empty and the launcher uses the newest available at install time.</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="wizard-page">
              <div className="wizard-hint">Optional — grab content now, or add more later from the Space menu.</div>
              {!isEdit && picked.length > 0 && (
                <div className="picked-mods">
                  {picked.map((m) => (
                    <span key={m.projectId} className="picked-chip">
                      {m.iconUrl && <img src={m.iconUrl} alt="" />} {m.title}
                      <button onClick={() => unpick(m.projectId)} title="Remove"><IconX size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <ModsBrowser
                mcVersion={mcVersion}
                loader={loader === 'soul' ? 'fabric' : loader}
                spacesModList={isEdit ? existing.mods : picked}
                onPick={pick}
                onUnpick={unpick}
                directSpaceId={isEdit ? existing.id : null}
                onDirectChange={onSaved}
                onSpaceCreated={onSpaceCreated}
                notify={notify}
              />
            </div>
          )}

          {step === 3 && (
            <div className="wizard-page wizard-name-page">
              <div className="field">
                <label className="field-label">Space name</label>
                <input
                  className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Cool World" maxLength={32}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canNext) save() }}
                />
              </div>
              <div className="field">
                <label className="field-label">Category <span className="field-optional">— optional group</span></label>
                <Dropdown
                  value={categoryId || 'none'}
                  onChange={(v) => { setCategoryId(v === 'none' ? null : v); if (v !== '__new__') setNewCatName('') }}
                  options={[
                    { value: 'none', label: 'No category' },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                    { value: '__new__', label: '+ New category…' },
                  ]}
                />
                {categoryId === '__new__' && (
                  <div className="wizard-newcat">
                    <input className="input" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="New category name…" maxLength={32} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') createCategoryInline() }} />
                    <button className="btn btn-secondary btn-small" onClick={createCategoryInline} disabled={!newCatName.trim()}><IconPlus size={14} /> Add</button>
                  </div>
                )}
              </div>
              <div className="field">
                <label className="field-label">Icon</label>
                <div className="spaceicon-grid">
                  {SPACE_ICONS.map((i) => (
                    <button key={i.id} className={`spaceicon-btn ${icon === i.id ? 'selected' : ''}`} onClick={() => setIcon(i.id)} title={i.label}>
                      <SpaceIcon name={i.id} size={24} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Color</label>
                <div className="color-row">
                  {SPACE_COLORS.map((c) => (
                    <button key={c} className={`color-dot ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
                  ))}
                </div>
              </div>
              <div className="wizard-preview" style={{ '--space-color': color }}>
                <div className="space-icon"><SpaceIcon name={icon} size={30} /></div>
                <div className="wizard-preview-text">
                  <div className="preview-name">{name.trim() || 'My Space'}</div>
                  <div className="preview-sub">
                    {LOADER_META[loader]?.label}{effLoaderVersion ? ` ${effLoaderVersion}` : ''} · {mcVersion || '…'}
                    {categoryId && categoryId !== '__new__' && <> · <IconLayers size={11} /> {categories.find((c) => c.id === categoryId)?.name}</>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {step > 0
            ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>Back</button>
            : <span className="wizard-foot-hint">{stepHint[step]}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saving && saveMsg && <span className="save-msg"><span className="mini-spinner" /> {saveMsg}</span>}
            {!saving && stepHint[step] && step > 0 && <span className="wizard-foot-hint">{stepHint[step]}</span>}
            {step < STEPS.length - 1
              ? <button className="btn btn-primary" onClick={() => canNext && setStep(step + 1)} disabled={!canNext || saving}>Next</button>
              : <button className="btn btn-primary" onClick={save} disabled={!canNext || saving}>{saving ? 'Working…' : isEdit ? 'Save changes' : 'Create Space'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
