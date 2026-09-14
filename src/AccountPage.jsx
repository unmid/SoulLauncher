import { useCallback, useEffect, useRef, useState } from 'react'
import * as skinview3d from 'skinview3d'
import { api, avatarUrl, openFileDialog } from './api.js'
import { IconMicrosoft, IconUser, IconPlus, IconCheck, IconX, IconKey, IconWarn, IconInfo, IconCape, IconRefresh, IconUpload, IconTrash } from './icons.jsx'

/**
 * Renders the cape FRONT side only, cropped straight from the real texture
 * (the 10x16 "outside" face at x1..11, y0..16 in the 64x32 cape layout —
 * works for any texture resolution). The back side and the elytra half of
 * the atlas are never shown, so every card looks like one clean cape front.
 */
function CapePreview({ url }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const sx = img.naturalWidth / 64
      const sy = img.naturalHeight / 32
      const S = 8
      canvas.width = 10 * S
      canvas.height = 16 * S
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 1 * sx, 0, 10 * sx, 16 * sy, 0, 0, 10 * S, 16 * S)
    }
    img.src = url
    return () => { img.onload = null }
  }, [url])
  return (
    <span className="cape-preview-frame">
      <canvas ref={ref} className="cape-canvas" alt="" />
    </span>
  )
}

/** 3D skin preview with a gentle walk cycle, sized to its container. */
function SkinViewer({ profile, loading }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const viewerRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return
    const wrap = wrapRef.current
    const w = Math.min(280, wrap.clientWidth - 24) || 256
    const viewer = new skinview3d.SkinViewer({
      canvas: canvasRef.current,
      width: w,
      height: Math.round(w * 1.4),
      preserveDrawingBuffer: true,
    })
    // The FXAA pass smears alpha edges into dark outlines. Pixel-crisp is
    // what we want for Minecraft anyway.
    if (viewer.fxaaPass) viewer.fxaaPass.enabled = false
    viewer.renderer.setClearColor(0x000000, 0)
    viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    viewer.fov = 38
    viewer.zoom = 0.72
    viewer.autoRotate = true
    viewer.autoRotateSpeed = 0.45
    viewer.controls.enableZoom = false
    viewer.controls.enablePan = false
    const walk = new skinview3d.WalkingAnimation()
    walk.speed = 0.55
    viewer.animation = walk
    viewerRef.current = viewer

    const ro = new ResizeObserver(() => {
      const nw = Math.min(280, wrap.clientWidth - 24)
      if (nw > 120) {
        viewer.width = nw
        viewer.height = Math.round(nw * 1.4)
      }
    })
    ro.observe(wrap)

    return () => {
      ro.disconnect()
      viewerRef.current = null
      viewer.dispose()
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !profile) return
    if (profile.activeSkinData) {
      // 'auto-detect' picks slim/classic correctly ('auto' is silently
      // treated as classic and makes slim skins show double arm layers)
      viewer.loadSkin(profile.activeSkinData, { model: 'auto-detect' })
    }
    if (profile.activeCapeUrl) viewer.loadCape(profile.activeCapeUrl)
    else viewer.loadCape(null)
  }, [profile])

  return (
    <div className="skin-viewer-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="skin-canvas" />
      {loading && <div className="skin-viewer-loading"><span className="mini-spinner" /></div>}
    </div>
  )
}

function ProfileSection({ activeAccount, notify }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [variant, setVariant] = useState('classic')

  const isMs = activeAccount?.kind === 'microsoft'

  const loadProfile = useCallback(async () => {
    if (!isMs) return
    setLoading(true)
    try {
      setProfile(await api.getAccountProfile(activeAccount.id))
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [activeAccount?.id, isMs, notify]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProfile() }, [loadProfile])

  const upload = async () => {
    const path = await openFileDialog({
      title: 'Pick a skin (PNG)',
      filters: [{ name: 'Skin', extensions: ['png'] }],
      multiple: false,
    })
    if (!path) return
    setBusy(true)
    try {
      await api.uploadSkin(activeAccount.id, path, variant)
      notify('Skin updated — looking sharp')
      await loadProfile()
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pickCape = async (capeId) => {
    setBusy(true)
    try {
      await api.setCape(activeAccount.id, capeId)
      notify(capeId ? 'Cape equipped' : 'Cape removed')
      await loadProfile()
    } catch (e) {
      const msg = String(e)
      if (/502|503|500/.test(msg)) {
        // A gateway error can arrive after Mojang has already applied the
        // change. Re-read the profile before showing a failure.
        try {
          const latest = await api.getAccountProfile(activeAccount.id)
          const applied = capeId
            ? latest.capes?.some((c) => c.id === capeId && c.active)
            : !latest.activeCapeUrl
          if (applied) {
            setProfile(latest)
            notify(capeId ? 'Cape equipped' : 'Cape removed')
            return
          }
        } catch { /* keep the service error below */ }
        notify('Mojang’s cape service is down right now (you can also switch capes on minecraft.net → Profile)', 'error')
      } else {
        notify(msg, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!activeAccount) return null

  if (!isMs) {
    return (
      <div className="mods-empty" style={{ marginTop: 22 }}>
        <div className="mods-empty-icon"><IconUser size={32} /></div>
        <div>Skins and capes need a Microsoft account</div>
        <div className="mods-empty-sub">Offline accounts play without a custom skin — sign in with Microsoft to customize your look.</div>
      </div>
    )
  }

  return (
    <div className="profile-grid">
      <div className="profile-left">
        <div className="profile-card-title"><IconUser size={15} /> {profile?.name || activeAccount.username}</div>
        <SkinViewer profile={profile} loading={loading} />
        <div className="skin-hint">Drag to spin · live skin preview</div>
      </div>

      <div className="profile-right">
        <section className="profile-section">
          <div className="profile-card-title"><IconUser size={15} /> Skins</div>
          <div className="profile-section-head">
            <div className="upload-row">
              <div className="segment">
                <button className={`segment-btn ${variant === 'classic' ? 'active' : ''}`} onClick={() => setVariant('classic')}>Classic</button>
                <button className={`segment-btn ${variant === 'slim' ? 'active' : ''}`} onClick={() => setVariant('slim')}>Slim</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-small" onClick={loadProfile} disabled={loading} title="Reload profile">
                  {loading ? <span className="mini-spinner" /> : <IconRefresh size={14} />}
                </button>
                <button className="btn btn-primary btn-small" onClick={upload} disabled={busy}>
                  <IconUpload size={16} active={busy} /> Upload skin
                </button>
              </div>
            </div>
          </div>
          {profile ? (
            <div className="skin-list">
              {profile.skins.map((s) => (
                <div key={s.id} className={`skin-row ${s.active ? 'active' : ''}`}>
                  <img src={avatarUrl(profile.name, 40)} alt="" draggable={false} />
                  <div className="skin-row-info">
                    <div className="skin-row-name">{s.variant === 'slim' ? 'Slim skin' : 'Classic skin'}</div>
                    <div className="skin-row-sub">{s.active ? 'Equipped right now' : 'Stored on your profile'}</div>
                  </div>
                  {s.active && <span className="active-badge">Active</span>}
                </div>
              ))}
              {profile.skins.length === 0 && <div className="toggle-sub" style={{ padding: '8px 2px' }}>No skins on this profile yet — upload one above.</div>}
            </div>
          ) : (
            <div className="skin-list">
              {[0, 1].map((i) => (
                <div key={i} className="skin-row">
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton skeleton-line" style={{ width: '40%' }} />
                    <div className="skeleton skeleton-line" style={{ width: '62%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="profile-section">
          <div className="profile-card-title"><IconCape size={15} /> Capes</div>
          {profile ? (
            profile.capes.length > 0 ? (
              <div className="cape-grid">
                <button className={`cape-card ${!profile.activeCapeUrl ? 'active' : ''}`} disabled={busy} onClick={() => pickCape(null)}>
                  <div className="cape-img cape-none"><IconCape size={22} /></div>
                  <span>No cape</span>
                </button>
                {profile.capes.map((c) => (
                  <button key={c.id} className={`cape-card ${c.active ? 'active' : ''}`} disabled={busy} onClick={() => pickCape(c.id)} title={c.alias}>
                    <div className="cape-img"><CapePreview url={c.url} /></div>
                    <span>{c.alias}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="toggle-sub">No capes on this account — capes come from events and Mojang promotions.</div>
            )
          ) : (
            <div className="cape-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="cape-card">
                  <div className="skeleton" style={{ width: '100%', maxWidth: 78, aspectRatio: '10 / 16', margin: '0 auto', borderRadius: 10 }} />
                  <div className="skeleton skeleton-line" style={{ width: '60%', marginLeft: 'auto', marginRight: 'auto' }} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default function AccountPage({ accounts, settings, activeAccount, refreshAccounts, refreshSettings, notify }) {
  const [msBusy, setMsBusy] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [offlineName, setOfflineName] = useState('')
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [removing, setRemoving] = useState(null)

  const switchTo = async (id) => {
    if (id === settings?.activeAccountId) return
    try {
      await api.switchAccount(id) // backend returns the updated settings
      await Promise.all([refreshAccounts(), refreshSettings()])
      notify('Account switched')
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const loginMs = async () => {
    setMsBusy(true)
    try {
      const acc = await api.loginMicrosoft()
      await Promise.all([refreshAccounts(), refreshSettings()])
      notify(`Welcome, ${acc.username}`)
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setMsBusy(false)
    }
  }

  const addOffline = async () => {
    const name = offlineName.trim()
    if (!/^\w{3,16}$/.test(name)) {
      notify('3–16 characters: letters, numbers, underscore', 'error')
      return
    }
    setOfflineBusy(true)
    try {
      const acc = await api.addOfflineAccount(name)
      await Promise.all([refreshAccounts(), refreshSettings()])
      setOfflineOpen(false)
      setOfflineName('')
      notify(`Offline account "${acc.username}" added`)
    } catch (e) {
      notify(String(e), 'error')
    } finally {
      setOfflineBusy(false)
    }
  }

  const remove = async () => {
    const acc = removing
    setRemoving(null)
    try {
      await api.removeAccount(acc.id)
      await Promise.all([refreshAccounts(), refreshSettings()])
      notify(`Removed ${acc.username}`)
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  return (
    <div className="page">
      <div className="content-head">
        <div>
          <h1 className="page-title">Account</h1>
          <p className="page-sub">Who's playing today? Switch any time — your skins and capes live here too.</p>
        </div>
      </div>

      <div className="acct-list">
        {accounts.map((a) => {
          const active = a.id === settings?.activeAccountId || (!settings?.activeAccountId && a.id === activeAccount?.id)
          return (
            <div key={a.id} className={`acct-row ${active ? 'active' : ''}`}>
              <img className="acct-avatar" src={avatarUrl(a.username, 56)} alt="" draggable={false} />
              <div className="acct-info">
                <div className="acct-name">{a.username}</div>
                <span className={`acct-badge ${a.kind === 'microsoft' ? 'ms' : 'offline'}`}>
                  {a.kind === 'microsoft' ? <><IconMicrosoft size={11} /> Microsoft</> : <><IconUser size={11} /> Offline</>}
                </span>
              </div>
              <div className="acct-actions">
                {active ? (
                  <span className="active-badge"><IconCheck size={12} /> In use</span>
                ) : (
                  <button className="btn btn-primary btn-small" onClick={() => switchTo(a.id)}>Use</button>
                )}
                <button className="btn btn-danger btn-small" onClick={() => setRemoving(a)} title="Remove account">
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
          )
        })}
        {accounts.length === 0 && (
          <div className="mods-empty">
            <div className="mods-empty-icon"><IconKey size={32} /></div>
            <div>No accounts yet</div>
            <div className="mods-empty-sub">Sign in with Microsoft (skins, capes, Realms) or play offline.</div>
          </div>
        )}
      </div>

      <div className="add-acct-row">
        <button className="btn btn-ms" onClick={loginMs} disabled={msBusy}>
          {msBusy ? <span className="mini-spinner" /> : <IconMicrosoft size={15} />}
          {msBusy ? 'Complete sign-in in the window…' : 'Sign in with Microsoft'}
        </button>
        <button className="btn btn-secondary" onClick={() => setOfflineOpen(true)} disabled={msBusy}>
          <IconPlus size={15} /> Play offline
        </button>
      </div>

      <div className="security-note">
        <IconInfo size={14} />
        <span>
          The Microsoft window may say “OpenLauncher” — Soul is a fork of OpenLauncher and shares its official
          sign-in service. Your token is stored in Windows Credential Manager and never leaves this PC.
        </span>
      </div>

      <ProfileSection activeAccount={activeAccount} notify={notify} />

      {offlineOpen && (
        <div className="confirm-pop" onClick={() => setOfflineOpen(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div className="confirm-title">Offline account</div>
              <button className="icon-btn" onClick={() => setOfflineOpen(false)}><IconX size={17} /></button>
            </div>
            <div className="confirm-text" style={{ textAlign: 'left' }}>Play without a Microsoft sign-in. No skins, capes or Realms — just a name.</div>
            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <input
                className="input"
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Username, e.g. Steve_2024"
                maxLength={16}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') addOffline() }}
              />
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setOfflineOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addOffline} disabled={offlineBusy || offlineName.trim().length < 3}>
                {offlineBusy ? <span className="mini-spinner" /> : <IconPlus size={14} />} Add account
              </button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <div className="confirm-pop" onClick={() => setRemoving(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon warn"><IconWarn size={26} /></div>
            <div className="confirm-title">Remove {removing.username}?</div>
            <div className="confirm-text">
              {removing.kind === 'microsoft'
                ? 'The sign-in token is wiped from this PC. You can sign in again any time.'
                : 'The offline account is deleted. Worlds inside Spaces stay untouched.'}
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setRemoving(null)}>Keep it</button>
              <button className="btn btn-danger" onClick={remove}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
