import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.opus', '.webm'])

/**
 * Scans public/musics for audio files and writes musics-manifest.json.
 * The app reads that manifest at runtime and plays a random track, so new
 * music dropped into the folder is picked up automatically (dev + build).
 */
function musicManifestPlugin() {
  const root = () => (typeof import.meta.dirname === 'string' ? import.meta.dirname : process.cwd())
  const write = () => {
    let files = []
    try {
      files = readdirSync(join(root(), 'public', 'musics'))
        .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()))
        .sort()
    } catch {}
    try {
      writeFileSync(join(root(), 'public', 'musics-manifest.json'), JSON.stringify({ files }))
    } catch {}
  }
  return {
    name: 'soul-music-manifest',
    buildStart() { write() },
    configureServer(server) {
      write()
      const dir = join(root(), 'public', 'musics')
      try { server.watcher.add(dir) } catch {}
      server.watcher.on('add', write)
      server.watcher.on('unlink', write)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), musicManifestPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Cargo writes into src-tauri/target during `tauri dev`; watching those
    // files makes chokidar crash with EBUSY on Windows and kills the server.
    watch: { ignored: ['**/src-tauri/target/**', '**/release/**', '**/dist/**'] },
  },
  build: {
    target: 'es2021',
    minify: 'oxc',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
})
