import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import ModsBrowser from './ModsBrowser.jsx'
import Dropdown from './Dropdown.jsx'
import { LOADER_META, LoaderMark, SPACE_ICONS, SpaceIcon, SPACE_COLORS, IconBack, IconCheck, IconSearch, IconX, IconDownload } from './icons.jsx'

const STEPS = [
  { id: 'version', label: 'Minecraft' },
  { id: 'software', label: 'Software' },
  { id: 'content', label: 'Content' },
  { id: 'name', label: 'Name it' },
]

export default function SpaceWizard({ existing = null, initialLoader = null, settings, onClose, onSaved, onSpaceCreated, notify }) {
  const isEdit = !!existing
  const [step, setStep] = useState(0)
  const [versions, setVersions] = useState(null)
  const [versionFilter, setVersionFilter] = useState('')
  const [versionKind, setVersionKind] = useState('release')
  const [mcVersion, setMcVersion] = useState(existing?.mcVersion || '')
  const [loader, setLoader] = useState(existing?.loader || initialLoader || 'fabric')
  const [loaderVersion, setLoaderVersion] = useState(existing?.loaderVersion || null)
  const [loaderVersions, setLoaderVersions] = useState([])
  const [soulBuilds, setSoulBuilds] = useState([])
  const [soulVersion, setSoulVersion] = useState(null)
  const [soulLoading, setSoulLoading] = useState(!existing)
  const [soulError, setSoulError] = useState('')
  const [picked, setPicked] = useState([]) // create mode only: {projectId,title,iconUrl,kind,source}
  const [name, setName] = useState(existing?.name || '')
  const [icon, setIcon] = useState(existing?.icon || 'crafting-table')
  const [color, setColor] = useState(existing?.color || '#5ac8fa')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [installed, setInstalled] = useState(new Set())
  const [loaderBusy, setLoaderBusy] = useState(false)

  useEffect(() => {
    api.listGameVersions()
      .then(setVersions)
      .catch((e) => { notify(String(e), 'error'); setVersions([]) })
    api.listInstalledVersions().then((v) => setInstalled(new Set(v))).catch(() => {})
    if (existing) return
    api.listSoulClients()
      .then((list) => {
        const builds = Array.isArray(list) ? list : []
        setSoulBuilds(builds)
        if (builds.length > 0 && builds[0]?.mcVersion) setSoulVersion(builds[0].id)
        if (builds.length === 0) setSoulError('No Soul Client builds are published yet.')
      })
      .catch((e) => setSoulError(String(e)))
      .finally(() => setSoulLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (existing || initialLoader !== 'soul') return
    setLoader('soul')
    setIcon('soul')
    setColor('#f26a3c')
  }, [existing, initialLoader])

  useEffect(() => {
    if (existing || loader !== 'soul' || soulVersion || soulBuilds.length === 0) return
    chooseSoulBuild(soulBuilds[0].id)
  }, [existing, loader, soulBuilds, soulVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mcVersion || loader === 'vanilla' || loader === 'soul') { setLoaderVersions([]); setLoaderVersion(null); setLoaderBusy(false); return }
    let cancelled = false
    setLoaderBusy(true)
    api.listLoaderVersions(loader, mcVersion)
      .then((list) => {
        if (cancelled) return
        setLoaderVersions(list)
        setLoaderVersion((cur) => (list.includes(cur) ? cur : list[0] || null))
        setLoaderBusy(false)
      })
      .catch(() => { if (!cancelled) { setLoaderVersions([]); setLoaderVersion(null); setLoaderBusy(false) } })
    return () => { cancelled = true }
  }, [mcVersion, loader]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSoul = useMemo(() => soulBuilds.find((build) => build.id === soulVersion) || null, [soulBuilds, soulVersion])

  const chooseLoader = (key) => {
    setLoader(key)
    setLoaderVersion(null)
    if (key === 'soul') {
      const build = selectedSoul || soulBuilds[0] || null
      if (build) {
        setSoulVersion(build.id)
        if (build.mcVersion) setMcVersion(build.mcVersion)
        setIcon('soul')
        setColor('#f26a3c')
      }
    }
  }

  const chooseSoulBuild = (id) => {
    setSoulVersion(id)
    const build = soulBuilds.find((item) => item.id === id)
    if (build?.mcVersion) setMcVersion(build.mcVersion)
  }

  const filteredVersions = useMemo(() => {
    if (!versions) return []
    const q = versionFilter.trim().toLowerCase()
    let list = q ? versions.filter((v) => v.id.toLowerCase().includes(q)) : versions
    if (versionKind === 'classic') {
      list = list.filter((v) => v.kind === 'old_beta' || v.kind === 'old_alpha')
    } else if (versionKind !== 'all') {
      list = list.filter((v) => v.kind === versionKind)
    }
    // already-downloaded versions float to the top
    return list.slice().sort((a, b) => Number(installed.has(b.id)) - Number(installed.has(a.id)))
  }, [versions, versionFilter, versionKind, installed])

  const canNext =
    step === 0 ? !!mcVersion :
    step === 1 ? (loader === 'soul' ? !!selectedSoul : (loader === 'vanilla' || !!loaderVersion || (!loaderBusy && loaderVersions.length === 0))) :
    step === 2 ? true :
    name.trim().length > 0

  const goNext = () => { if (canNext && step < STEPS.length - 1) setStep(step + 1) }

  // Keyboard shortcuts: Enter advances, Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && !saving && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); goNext(); return }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, canNext, saving, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

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
        notify(`"${built.name}" (Minecraft ${built.mcVersion}) is being set up — watch its card fill up`)
        onClose()
        return
      }
      if (isEdit) {
        await api.updateSpace({ ...existing, name: name.trim(), icon, color, mcVersion, loader, loaderVersion: loader === 'vanilla' ? null : loaderVersion })
        onSaved()
        notify('Space updated')
        onClose()
        return
      }
      setSaveMsg('Creating your Space…')
      const space = {
        id: '',
        name: name.trim(),
        icon,
        color,
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion,
        installedVersionId: null,
        mods: [],
        createdAt: 0,
        lastPlayed: null,
        ramGb: null,
      }
      const created = await api.createSpace(space)
      if (picked.length > 0) {
        let ok = 0
        for (let i = 0; i < picked.length; i++) {
          setSaveMsg(`Adding content… ${i + 1}/${picked.length}`)
          const p = picked[i]
          try {
            await api.installContent(created.id, { source: p.source, kind: p.kind, projectId: p.projectId })
            ok++
          } catch (e) {
            notify(`Couldn't add ${p.title}: ${String(e).slice(0, 80)}`, 'error')
          }
        }
        if (ok > 0) notify(`Added ${ok} item${ok > 1 ? 's' : ''}`)
      }
      onSaved()
      notify('Space created — press Play')
      onClose()
    } catch (e) {
      notify(String(e), 'error')
      setSaving(false)
      setSaveMsg('')
    }
  }

  const handleEnter = () => {
    if (saving) return
    if (step < STEPS.length - 1) goNext()
    else if (canNext) save()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="wizard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit Space' : 'New Space'}>
        <div className="wizard-head">
          <div className="wizard-head-text">
            <div className="wizard-title">{isEdit ? 'Edit Space' : 'New Space'}</div>
            <div className="wizard-sub">
              {isEdit
                ? `Update ${existing.name} — versions, software and content`
                : 'Four quick steps and you are ready to play'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)"><IconX size={18} /></button>
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, i) => {
            const state = i === step ? 'active' : i < step ? 'done' : ''
            return (
              <div key={s.id} className={`wizard-step ${state}`} onClick={() => i < step && setStep(i)} title={i < step ? `Back to ${s.label}` : undefined}>
                <span className="wizard-dot">{i < step ? <IconCheck size={11} /> : i + 1}</span>
                <span className="wizard-step-label">{s.label}</span>
              </div>
            )
          })}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <div className="wizard-page">
              <div className="wizard-hint">Pick the Minecraft version you want to play.</div>
              <div className="wizard-tools">
                <div className="search-box wizard-search">
                  <IconSearch size={16} />
                  <input
                    value={versionFilter}
                    onChange={(e) => setVersionFilter(e.target.value)}
                    placeholder="Search versions… try “1.21”"
                  />
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
                  {Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 41, borderRadius: 10 }} />)}
                </div>
              ) : (
                <div className="version-list">
                  {filteredVersions.map((v) => (
                    <button
                      key={v.id + v.kind}
                      className={`version-row ${mcVersion === v.id ? 'selected' : ''}`}
                      onClick={() => setMcVersion(v.id)}
                    >
                      <span className="version-row-id">{v.id}</span>
                      {installed.has(v.id) && <span className="installed-badge"><IconDownload size={10} /> installed</span>}
                      {v.kind !== 'release' && (
                        <span className={`version-chip-kind ${v.kind === 'release' ? 'kind-release' : 'kind-snapshot'}`}>
                          {v.kind === 'snapshot' ? 'snapshot' : v.kind.startsWith('old') ? 'classic' : v.kind}
                        </span>
                      )}
                      {mcVersion === v.id && <span className="version-row-check"><IconCheck size={15} /></span>}
                    </button>
                  ))}
                  {filteredVersions.length === 0 && (
                    <div className="wizard-none">No versions match — try a different search.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="wizard-page">
              <div className="wizard-hint">Pure vanilla, our tuned client, a mod loader, or OptiFine?</div>
              <button
                type="button"
                className={`soul-client-card ${loader === 'soul' ? 'selected' : ''}`}
                onClick={() => chooseLoader('soul')}
                aria-pressed={loader === 'soul'}
              >
                <span className="soul-client-mark"><LoaderMark.soul size={30} /></span>
                <span className="soul-client-text">
                  <span className="loader-label">Soul Client</span>
                  <span className="loader-desc">{LOADER_META.soul.desc}</span>
                  <span className="soul-client-meta">
                    {soulLoading
                      ? <><span className="mini-spinner" /> Checking available builds…</>
                      : selectedSoul
                        ? `${selectedSoul.name} · Minecraft ${selectedSoul.mcVersion} · ${selectedSoul.modCount || ''} mods`.replace('  ', ' ')
                        : (soulError || 'No Soul Client builds are published yet.')}
                  </span>
                </span>
                {loader === 'soul' && <span className="version-row-check"><IconCheck size={16} /></span>}
              </button>
              {loader === 'soul' && (
                <div className="field">
                  <label className="field-label">Client build</label>
                  <Dropdown
                    value={soulVersion}
                    onChange={chooseSoulBuild}
                    options={soulBuilds.map((build) => ({
                      value: build.id,
                      label: `${build.name} · Minecraft ${build.mcVersion}`,
                      hint: build.modCount ? `${build.modCount} mods` : undefined,
                    }))}
                    placeholder={soulLoading ? 'Checking builds…' : soulError || 'No builds available'}
                  />
                  <div className="field-hint">
                    A Soul Client build chooses its own Minecraft and Fabric versions. The launcher installs the loader,
                    then fills the Space’s mods folder from the build manifest.
                  </div>
                </div>
              )}
              <div className="loader-grid">
                {Object.entries(LOADER_META).filter(([key]) => key !== 'soul').map(([key, meta]) => {
                  const Mark = LoaderMark[key] || LoaderMark.vanilla
                  return (
                    <button
                      key={key}
                      className={`loader-card ${loader === key ? 'selected' : ''}`}
                      onClick={() => chooseLoader(key)}
                    >
                      <span className="loader-mark"><Mark size={26} /></span>
                      <span className="loader-card-text">
                        <span className="loader-label">{meta.label}</span>
                        <span className="loader-desc">{meta.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {loader !== 'vanilla' && loader !== 'soul' && loaderVersions.length > 0 && (
                <div className="field">
                  <label className="field-label">{LOADER_META[loader]?.label} version</label>
                  <Dropdown
                    value={loaderVersion}
                    onChange={setLoaderVersion}
                    options={loaderVersions.map((v, i) => ({ value: v, label: v, hint: i === 0 ? 'recommended' : undefined }))}
                    filter={loaderVersions.length > 10}
                  />
                </div>
              )}
              {loader !== 'vanilla' && loader !== 'soul' && mcVersion && loaderBusy && (
                <div className="loading-line"><span className="mini-spinner" /> Checking versions…</div>
              )}
              {loader !== 'vanilla' && loader !== 'soul' && mcVersion && !loaderBusy && loaderVersions.length === 0 && (
                <div className="mods-empty" style={{ padding: '20px 16px' }}>
                  <div>No {LOADER_META[loader]?.label} build for Minecraft {mcVersion} yet</div>
                  <div className="mods-empty-sub">Try a slightly older Minecraft version — loader support usually lands a few weeks after release.</div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="wizard-page">
              <div className="wizard-hint">Grab content from Modrinth or CurseForge — you can add more later.</div>
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
              <div className="wizard-hint">Give it a name and a look.</div>
              <div className="field">
                <label className="field-label">Space name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Cool World"
                  maxLength={32}
                />
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
              <div className="field">
                <label className="field-label">Color</label>
                <div className="color-row">
                  {SPACE_COLORS.map((c) => (
                    <button key={c} className={`color-dot ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
                  ))}
                </div>
              </div>
              <div className="wizard-preview" style={{ '--space-color': color }}>
                <div className="space-icon"><SpaceIcon name={icon} size={30} /></div>
                <div className="wizard-preview-text">
                  <div className="preview-name">{name.trim() || 'My Space'}</div>
                  <div className="preview-sub">{LOADER_META[loader]?.label}{loaderVersion ? ` ${loaderVersion}` : ''} · {mcVersion}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>
              <IconBack size={16} /> Back
            </button>
          ) : <span />}
          {saving && saveMsg && <span className="save-msg"><span className="mini-spinner" /> {saveMsg}</span>}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={goNext} disabled={!canNext || saving}>
              Next
            </button>
          ) : (
            <button className="btn btn-primary" onClick={save} disabled={!canNext || saving}>
              {saving ? 'Working…' : isEdit ? 'Save changes' : 'Create Space'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
