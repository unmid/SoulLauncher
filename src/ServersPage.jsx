import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { IconPlayers, IconSignal, IconServer, IconRefresh, IconCopy, IconCheck, IconBolt } from './icons.jsx'

function pingKey(server) {
  return splitServerAddress(server).key
}
const serverAddress = (s) => s.ip + ((s.port && s.port !== 25565) ? `:${s.port}` : '')
const SERVERS_CACHE_KEY = 'soul.servers.v1'
// Built-in fallback: famous servers shown when the GitHub list is
// unreachable AND nothing is cached. Never an empty page, never a 404.
const FALLBACK_SERVERS = [
  { name: 'Hypixel', ip: 'mc.hypixel.net', port: 25565, icon: '', motd: 'Minigames, SkyBlock, Bed Wars', category: 'Popular', sponsored: false, minVersion: '' },
  { name: 'CubeCraft', ip: 'play.cubecraft.net', port: 25565, icon: '', motd: 'EggWars, SkyWars, Survival Games', category: 'Popular', sponsored: false, minVersion: '' },
  { name: 'Minehut', ip: 'mc.minehut.com', port: 25565, icon: '', motd: 'Free servers, thousands of player worlds', category: 'Popular', sponsored: false, minVersion: '' },
  { name: 'GommeHD', ip: 'gommehd.net', port: 25565, icon: '', motd: 'BedWars, SkyWars, CityBuild', category: 'Popular', sponsored: false, minVersion: '' },
  { name: '2b2t', ip: 'connect.2b2t.org', port: 25565, icon: '', motd: 'The oldest anarchy server in Minecraft', category: 'Anarchy', sponsored: false, minVersion: '' },
]

function splitServerAddress(server) {
  const fallbackPort = server.port || 25565
  const raw = String(server.ip || '').trim()
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    if (end > 0) {
      const host = raw.slice(1, end)
      const rest = raw.slice(end + 1)
      const port = rest.startsWith(':') && /^\d{1,5}$/.test(rest.slice(1)) ? Number(rest.slice(1)) : fallbackPort
      return { host, port, key: `${host}:${port}` }
    }
  }
  const lastColon = raw.lastIndexOf(':')
  if (lastColon > 0 && raw.indexOf(':') === lastColon && /^\d{1,5}$/.test(raw.slice(lastColon + 1))) {
    const host = raw.slice(0, lastColon)
    const port = Number(raw.slice(lastColon + 1)) || fallbackPort
    return { host, port, key: `${host}:${port}` }
  }
  return { host: raw, port: fallbackPort, key: `${raw}:${fallbackPort}` }
}

function uniqueServers(list) {
  const seen = new Set()
  const out = []
  for (const server of list || []) {
    const key = pingKey(server)
    if (!key || key === ':25565' || seen.has(key)) continue
    seen.add(key)
    out.push(server)
  }
  return out
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVERS_CACHE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

// Static wallpaper backdrop only — the remote iframe is gone, so a dead
// GitHub page can never show a 404 inside the app.
function ServersBackdrop() {
  return (
    <div className="servers-bg" aria-hidden="true">
      <div className="servers-bg-fallback" style={{ backgroundImage: 'url(./wallpapers/w2.png)' }} />
      <div className="servers-bg-scrim" />
    </div>
  )
}

export default function ServersPage({ notify }) {
  const [servers, setServers] = useState(null) // null = loading
  const [pings, setPings] = useState({})
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [copied, setCopied] = useState(null) // pingKey of the row just copied
  const pingRunRef = useRef(0)

  const pingOne = useCallback((server, runId) => {
    const { host, port, key } = splitServerAddress(server)
    if (!host) {
      setPings((p) => ({ ...p, [key]: { online: false, pingMs: 0, playersOnline: 0, playersMax: 0, motd: '', icon: '', version: '' } }))
      return
    }
    api.pingServer(host, port)
      .then((r) => {
        if (runId !== undefined && pingRunRef.current !== runId) return
        setPings((p) => ({ ...p, [key]: r }))
      })
      .catch(() => {
        if (runId !== undefined && pingRunRef.current !== runId) return
        setPings((p) => ({ ...p, [key]: { online: false, pingMs: 0, playersOnline: 0, playersMax: 0, motd: '', icon: '', version: '' } }))
      })
  }, [])

  const pingAll = useCallback((list) => {
    const runId = ++pingRunRef.current
    // Stagger requests so a long list does not fire twenty sockets at once,
    // and so a refresh can cleanly invalidate the previous batch.
    list.forEach((server, index) => {
      setTimeout(() => {
        if (pingRunRef.current === runId) pingOne(server, runId)
      }, Math.min(index * 140, 1600))
    })
  }, [pingOne])

  const retryPing = useCallback((server) => {
    const runId = ++pingRunRef.current
    pingOne(server, runId)
  }, [pingOne])

  const [usingFallback, setUsingFallback] = useState(false)

  const load = useCallback(async () => {
    pingRunRef.current += 1 // invalidate pings already in flight
    setServers(null)
    setPings({})
    setUsingFallback(false)
    let list = null
    try {
      list = await api.getServerList()
    } catch { list = null }
    const cached = readCache()
    const fresh = uniqueServers(list || [])
    if (fresh.length) {
      // Online with a live list: use it and refresh the offline cache.
      setOnline(true)
      setOffline(false)
      setServers(fresh)
      pingAll(fresh)
      try { localStorage.setItem(SERVERS_CACHE_KEY, JSON.stringify(fresh)) } catch {}
      return
    }
    if (cached.length) {
      // List unreachable: fall back to the last saved copy.
      setOnline(navigator.onLine)
      setOffline(true)
      setServers(uniqueServers(cached))
      return
    }
    // Nothing cached either: built-in popular servers, still pinged live.
    const pop = uniqueServers(FALLBACK_SERVERS)
    setOnline(navigator.onLine)
    setOffline(true)
    setUsingFallback(true)
    setServers(pop)
    pingAll(pop)
  }, [pingAll])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const wentOffline = () => { setOnline(false); setOffline(true) }
    const wentOnline = () => setOnline(true)
    window.addEventListener('offline', wentOffline)
    window.addEventListener('online', wentOnline)
    return () => {
      window.removeEventListener('offline', wentOffline)
      window.removeEventListener('online', wentOnline)
    }
  }, [])

  const wasOnlineRef = useRef(online)
  useEffect(() => {
    if (online && !wasOnlineRef.current) load()
    wasOnlineRef.current = online
  }, [online, load])

  // group by category, sponsored first inside each group
  const groups = useMemo(() => {
    if (!servers) return []
    const map = new Map()
    for (const s of servers) {
      const cat = s.category?.trim() || 'Servers'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(s)
    }
    return [...map.entries()].map(([category, items]) => ({
      category,
      items: items.slice().sort((a, b) => (b.sponsored ? 1 : 0) - (a.sponsored ? 1 : 0)),
    }))
  }, [servers])

  const copyAddress = async (s) => {
    const address = serverAddress(s)
    let ok = false
    try {
      await navigator.clipboard.writeText(address)
      ok = true
    } catch {
      // clipboard API can be unavailable; fall back to a manual selection box
      try {
        const ta = document.createElement('textarea')
        ta.value = address
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch { ok = false }
    }
    if (ok) {
      setCopied(pingKey(s))
      notify(`Copied "${address}" — paste it in Minecraft: Multiplayer → Add Server`)
      setTimeout(() => setCopied((c) => (c === pingKey(s) ? null : c)), 2200)
    } else {
      notify(`Couldn't copy automatically — the address is: ${address}`, 'error')
    }
  }

  return (
    <div className="page-full">
      <ServersBackdrop />
      <div className="page-inner servers-content">
        <div className="content-head">
          <div>
            <h1 className="page-title">Servers</h1>
            <p className="page-sub">Hand-picked worlds to explore — copy an address and paste it into Minecraft.</p>
          </div>
          <div className="head-actions">
            <button className="btn btn-secondary" onClick={load} disabled={servers === null}>
              <IconRefresh size={15} /> Refresh
            </button>
          </div>
        </div>

        {servers === null && (
          <div className="server-list" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="server-row">
                <div className="server-icon skeleton" />
                <div className="server-main">
                  <div className="skeleton skeleton-line" style={{ width: '34%' }} />
                  <div className="skeleton skeleton-line" style={{ width: '64%' }} />
                  <div className="skeleton skeleton-line" style={{ width: '22%' }} />
                </div>
                <div className="skeleton skeleton-btn" />
              </div>
            ))}
          </div>
        )}

        {servers !== null && usingFallback && servers.length > 0 && (
          <div className="offline-note">
            <IconSignal size={14} />
            The online list is unreachable — showing popular servers instead. They still ping live.
          </div>
        )}

        {servers !== null && !usingFallback && offline && servers.length > 0 && (
          <div className="offline-note">
            <IconSignal size={14} />
            You're offline — showing your saved servers. Copying addresses still works; live pings are paused.
          </div>
        )}

        {servers !== null && servers.length === 0 && (
          <div className="mods-empty">
            <div className="mods-empty-icon"><IconServer size={32} /></div>
            <div>{offline ? "You're offline and there's no saved server list yet" : 'No servers right now'}</div>
            <div className="mods-empty-sub">{offline ? 'Connect to the internet once — the list is then saved on this PC for offline use.' : 'The list lives online — check your connection and hit Refresh.'}</div>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.category} className="server-group">
            <h2 className="server-group-title">{g.category}</h2>
            <div className="server-list">
              {g.items.map((s) => {
                const ping = pings[pingKey(s)]
                const icon = s.icon || ping?.icon || ''
                const motd = s.motd || ping?.motd || ''
                return (
                  <div key={pingKey(s)} className={`server-row ${s.sponsored ? 'server-row-sponsored' : ''}`}>
                    <div className="server-icon">
                      {icon ? <img src={icon} alt="" draggable={false} /> : <IconServer size={26} />}
                    </div>
                    <div className="server-main">
                      <div className="server-name">
                        {s.name}
                        {s.sponsored && <span className="sponsored-badge"><IconBolt size={11} /> Sponsored</span>}
                      </div>
                      {motd && <div className="server-motd">{motd}</div>}
                      <div className="server-meta">
                        <span className="server-ip">{serverAddress(s)}</span>
                        {offline ? (
                          <span className="server-ping off"><IconSignal size={12} /> offline</span>
                        ) : ping ? (
                          ping.online ? (
                            <>
                              <span className="server-players"><IconPlayers size={12} /> {ping.playersOnline}/{ping.playersMax}</span>
                              <span className={`server-ping ${ping.pingMs < 80 ? 'good' : ping.pingMs < 160 ? 'ok' : 'bad'}`}>
                                <IconSignal size={12} /> {ping.pingMs} ms
                              </span>
                              {ping.version && <span className="server-version">{ping.version}</span>}
                              {s.minVersion && <span className="server-version">MC {s.minVersion}+</span>}
                            </>
                          ) : (
                            <span className="server-ping off"><IconSignal size={12} /> offline</span>
                          )
                        ) : (
                          <span className="server-ping checking"><span className="mini-spinner" /> pinging…</span>
                        )}
                      </div>
                    </div>
                    {!offline && ping && !ping.online && (
                      <button
                        className="icon-btn ping-retry"
                        onClick={() => retryPing(s)}
                        title="Ping this server again"
                        aria-label={`Ping ${s.name} again`}
                      >
                        <IconRefresh size={13} />
                      </button>
                    )}
                    <button
                      className={`btn ${copied === pingKey(s) ? 'btn-primary' : 'btn-secondary'} copy-btn`}
                      onClick={() => copyAddress(s)}
                      title="Copy the address — paste it in Minecraft: Multiplayer → Add Server"
                    >
                      {copied === pingKey(s) ? <><IconCheck size={14} /> Copied</> : <><IconCopy size={14} /> Copy</>}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
