import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'

const loaderVersionCache = new Map()
const isTauriRuntime = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
const SERVER_LIST_URL = 'https://raw.githubusercontent.com/unmid/SoulLauncher/main/serverlist.json'
const PREVIEW_GAME_VERSIONS = [
  { id: '26.2', kind: 'release', releaseTime: '' }, { id: '26.3-rc-1', kind: 'snapshot', releaseTime: '' },
  { id: '26.1.2', kind: 'release', releaseTime: '' }, { id: '26.1.1', kind: 'release', releaseTime: '' },
  { id: '26.1', kind: 'release', releaseTime: '' }, { id: '1.21.11', kind: 'release', releaseTime: '' },
  { id: '1.21.8', kind: 'release', releaseTime: '' }, { id: '1.21.1', kind: 'release', releaseTime: '' },
  { id: 'b1.7.3', kind: 'old_beta', releaseTime: '' }, { id: '1.20.1', kind: 'release', releaseTime: '' },
  { id: 'rd-132211', kind: 'old_alpha', releaseTime: '' }, { id: '1.16.5', kind: 'release', releaseTime: '' },
  { id: '1.12.2', kind: 'release', releaseTime: '' }, { id: '1.8.9', kind: 'release', releaseTime: '' },
]
const PREVIEW_SERVERS = [{ name: 'Soul Community', ip: 'play.soul.example', port: 25565, icon: '', motd: 'Preview server list', category: 'Community', sponsored: false, minVersion: '26.2' }]

export const api = {
  // settings
  getSettings: () => invoke('get_settings'),
  saveSettings: (settings) => isTauriRuntime() ? invoke('save_settings', { settings }) : Promise.resolve(settings),

  // versions / loaders
  listGameVersions: () => isTauriRuntime()
    ? invoke('list_game_versions')
    : Promise.resolve(PREVIEW_GAME_VERSIONS),
  listLoaderVersions: async (loader, mcVersion) => {
    const key = `${loader}:${mcVersion}`
    if (loaderVersionCache.has(key)) return loaderVersionCache.get(key)
    if (!isTauriRuntime()) {
      const preview = loader === 'optifine'
        ? ['HD_U_I9', 'HD_U_I8', 'HD_U_I7', 'HD_U_I6', 'HD_U_G8', 'HD_U_G5']
        : loader === 'forge'
          ? ['52.0.28', '51.0.33', '50.2.0', '47.3.0', '40.2.17']
          : loader === 'neoforge'
            ? ['21.8.31', '21.7.25', '21.1.200', '20.6.139']
            : ['0.17.2', '0.16.14', '0.15.11', '0.14.25']
      loaderVersionCache.set(key, preview)
      return preview
    }
    const versions = await invoke('list_loader_versions', { loader, mcVersion })
    const list = Array.isArray(versions) ? versions : []
    loaderVersionCache.set(key, list)
    return list
  },
  listInstalledVersions: () => isTauriRuntime() ? invoke('list_installed_versions') : Promise.resolve([]),

  // spaces
  listSpaces: () => invoke('list_spaces'),
  createSpace: (space) => invoke('create_space', { space }),
  updateSpace: (space) => invoke('update_space', { space }),
  duplicateSpace: (spaceId) => invoke('duplicate_space', { spaceId }),
  pinSpaceShortcut: (spaceId) => invoke('pin_space_shortcut', { spaceId }),
  unpinSpaceShortcut: (spaceId) => invoke('unpin_space_shortcut', { spaceId }),
  launchArgs: () => isTauriRuntime() ? invoke('launch_args') : Promise.resolve([]),
  deleteSpace: (spaceId, deleteFiles = true) => invoke('delete_space', { spaceId, deleteFiles }),
  openSpaceFolder: (spaceId) => invoke('open_space_folder', { spaceId }),
  exportSpace: (spaceId, path) => invoke('export_space', { spaceId, path }),
  importSpace: (path) => invoke('import_space', { path }),

  // content (mods / packs / shaders)
  searchContent: ({ source = 'modrinth', kind = 'mod', query = '', mcVersion = '', loader = '', sort = 'relevance', offset = 0 }) =>
    invoke('search_content', { source, kind, query, mcVersion, loader, sort, offset }),
  getContentDetails: ({ source = 'modrinth', projectId }) =>
    invoke('content_details', { source, projectId }),
  installContent: (spaceId, { source, kind, projectId }) =>
    invoke('install_content', { spaceId, source, kind, projectId }),
  removeContent: (spaceId, projectId) => invoke('remove_content', { spaceId, projectId }),
  reconcileContent: (spaceId) => invoke('reconcile_content', { spaceId }),

  // modpacks + local files
  installModpack: (source, projectId, mcVersion = null) => invoke('install_modpack', { source, projectId, mcVersion }),
  importModpackFile: (path) => invoke('import_modpack_file', { path }),
  importContentFiles: (spaceId, paths, kind = null, world = null) =>
    invoke('import_content_files', { spaceId, paths, kind, world }),
  listSpaceWorlds: (spaceId) => isTauriRuntime() ? invoke('list_space_worlds', { spaceId }) : Promise.resolve([]),
  assignDatapack: (spaceId, projectId, world) => invoke('assign_datapack', { spaceId, projectId, world }),

  // soul client (official tuned FPS client)
  listSoulClients: () => isTauriRuntime()
    ? invoke('list_soul_clients')
    : Promise.resolve([{ id: '26.2', name: 'Soul Client 26.2', mcVersion: '26.2', zip: 'client/version-26.2/soul-client-26-2.zip', modCount: 24, released: '', notes: 'Preview build' }]),
  installSoulClient: (version) =>
    invoke('install_soul_client', { version }),

  // remote + servers
  getHomePages: () => invoke('get_home_pages'),
  getServerList: () => isTauriRuntime()
    ? invoke('get_server_list')
    : fetch(SERVER_LIST_URL)
        .then((r) => { if (!r.ok) throw new Error('server list unavailable'); return r.json() })
        .then((v) => (v && Array.isArray(v.servers) ? v.servers : PREVIEW_SERVERS))
        .catch(() => PREVIEW_SERVERS),
  pingServer: (host, port) => isTauriRuntime()
    ? invoke('ping_server', { host, port })
    : Promise.resolve({ online: true, playersOnline: 12, playersMax: 100, motd: 'Preview server list', icon: '', version: '1.21.8', pingMs: 42 }),

  // accounts
  listAccounts: () => invoke('list_accounts'),
  addOfflineAccount: (name) => invoke('add_offline_account', { name }),
  loginMicrosoft: () => invoke('login_microsoft'),
  removeAccount: (accountId) => invoke('remove_account', { accountId }),
  switchAccount: (accountId) => invoke('switch_account', { accountId }),
  validateAccount: (accountId) => invoke('validate_account', { accountId }),
  getAccountProfile: (accountId) => invoke('get_account_profile', { accountId }),
  setCape: (accountId, capeId) => invoke('set_cape', { accountId, capeId }),
  uploadSkin: (accountId, path, variant) => invoke('upload_skin', { accountId, path, variant }),

  // optimize / storage
  hardwareScan: () => isTauriRuntime() ? invoke('hardware_scan') : Promise.resolve(null),
  recommendedRam: (totalGb) => isTauriRuntime() ? invoke('recommended_ram', { totalGb }) : Promise.resolve(4),
  storageBreakdown: () => isTauriRuntime() ? invoke('storage_breakdown') : Promise.resolve([]),
  cleanStorageJunk: () => isTauriRuntime() ? invoke('clean_storage_junk') : Promise.resolve(0),

  // update
  checkUpdate: () => isTauriRuntime() ? invoke('check_update') : Promise.resolve({ available: false }),
  downloadUpdate: (url) => invoke('download_update', { url }),

  // misc
  fetchBytesB64: (url) => invoke('fetch_bytes_b64', { url }),
  launchSpace: (spaceId, server) =>
    invoke('launch_space', server ? { spaceId, serverIp: server.ip, serverPort: server.port } : { spaceId }),
  isRunning: (spaceId) => invoke('is_running', { spaceId }),
  appDataDir: () => isTauriRuntime() ? invoke('app_data_dir') : Promise.resolve(''),
  openUrl: (url) => isTauriRuntime() ? invoke('open_url', { url }) : Promise.resolve(window.open(url, '_blank')),
  readLogs: () => isTauriRuntime() ? invoke('read_logs') : Promise.resolve(''),

  onProgress: (handler) => {
    if (!isTauriRuntime()) return Promise.resolve(() => {})
    try { return Promise.resolve(listen('space-progress', (e) => handler(e.payload))).catch(() => () => {}) } catch { return Promise.resolve(() => {}) }
  },
  onUpdateProgress: (handler) => {
    if (!isTauriRuntime()) return Promise.resolve(() => {})
    try { return Promise.resolve(listen('update-progress', (e) => handler(e.payload))).catch(() => () => {}) } catch { return Promise.resolve(() => {}) }
  },
  onLog: (handler) => {
    if (!isTauriRuntime()) return Promise.resolve(() => {})
    try { return Promise.resolve(listen('app-log', (e) => handler(e.payload))).catch(() => () => {}) } catch { return Promise.resolve(() => {}) }
  },
}

export { open as openFileDialog, save as saveFileDialog }

export function avatarUrl(username, size = 64) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/${size}`
}

export function fmtDownloads(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n || 0)
}

export function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return String(n || 0) + ' B'
}
