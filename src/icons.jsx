// Soul app icons — Lucide (https://lucide.dev/icons/) for ALL in-app UI icons.
// Third-party brand marks (GitHub/Discord/Microsoft/Modrinth/CurseForge) and
// software loader logos + Minecraft block art stay as image assets below.
import { useState } from 'react'
import {
  House, Layers, Server, User, Zap, Newspaper, Settings, CloudDownload,
  KeyRound, ArrowLeft, Play, Pause, Plus, Pencil, Copy, Trash, Search, X,
  Check, Folder, Download, Upload, Import, Share2, EllipsisVertical, Clock,
  Globe, Shield, Lock, Music, Gamepad2, Brush, Shirt, Heart, Hammer, Cpu,
  MemoryStick, CircuitBoard, AppWindow, Sparkles, Star, HardDrive,
  ExternalLink, RefreshCw, Package, Users, Signal, Info, TriangleAlert,
  Rocket, Sun, Moon,
} from 'lucide-react'

const L = (C) => ({ size = 22, style, className, strokeWidth = 1.8, ...rest }) => (
  <C
    size={size}
    strokeWidth={strokeWidth}
    aria-hidden="true"
    className={`soul-ic${className ? ` ${className}` : ''}`}
    style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle', ...style }}
    {...rest}
  />
)

// --- navigation ---
export const IconHome = L(House)
export const IconLayers = L(Layers)
export const IconServer = L(Server)
export const IconUser = L(User)
export const IconBolt = L(Zap)
export const IconNews = L(Newspaper)
export const IconGear = L(Settings)
export const IconUpdate = L(CloudDownload)
export const IconKey = L(KeyRound)
export const IconBack = L(ArrowLeft)

// --- actions / ui ---
export const IconPlay = L(Play)
export const IconPause = L(Pause)
export const IconPlus = L(Plus)
export const IconEdit = L(Pencil)
export const IconCopy = L(Copy)
export const IconTrash = L(Trash)
export const IconSearch = L(Search)
export const IconX = L(X)
export const IconCheck = L(Check)
export const IconFolder = L(Folder)
export const IconDownload = L(Download)
export const IconUpload = L(Upload)
export const IconImport = L(Import)
export const IconShare = L(Share2)
export const IconMore = L(EllipsisVertical)
export const IconClock = L(Clock)
export const IconGlobe = L(Globe)
export const IconShield = L(Shield)
export const IconLock = L(Lock)
export const IconMusic = L(Music)
export const IconGamepad = L(Gamepad2)
export const IconBrush = L(Brush)
export const IconCape = L(Shirt)
export const IconHeart = L(Heart)
export const IconHammer = L(Hammer)
export const IconCpu = L(Cpu)
export const IconRam = L(MemoryStick)
export const IconGpu = L(CircuitBoard)
export const IconOs = L(AppWindow)
export const IconSparkle = L(Sparkles)
export const IconStar = L(Star)
export const IconDisk = L(HardDrive)
export const IconExternal = L(ExternalLink)
export const IconRefresh = L(RefreshCw)
export const IconCube = L(Package)
export const IconPlayers = L(Users)
export const IconSignal = L(Signal)
export const IconInfo = L(Info)
export const IconWarn = L(TriangleAlert)
export const IconRocket = L(Rocket)
export const IconSun = L(Sun)
export const IconMoon = L(Moon)

// --- third-party brand marks (NOT app icons: kept as custom marks) ---
const B = ({ size = 22, children, style, className, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    aria-hidden="true"
    className={`soul-ic${className ? ` ${className}` : ''}`}
    style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle', ...style }}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
)
export const IconGithub = (p) => (
  <B {...p}><path d="M14 3.5c-6 0-10.5 4.5-10.5 10.5 0 4.6 3 8.6 7.2 10 .5.1.7-.2.7-.5v-2c-3 .6-3.6-1.3-3.6-1.3-.5-1.2-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.4-.3-5-1.2-5-5.4 0-1.2.4-2.2 1.1-3 0-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10.4 10.4 0 0 1 5.6 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.8 1.1 3 0 4.2-2.6 5.1-5 5.4.4.3.7 1 .7 2v3c0 .3.2.6.8.5 4.2-1.4 7.2-5.4 7.2-10C24.5 8 20 3.5 14 3.5Z" /></B>
)
export const IconDiscord = (p) => (
  <B {...p}><path d="M8 8.5c2-1 3.5-1.3 6-1.3s4 .3 6 1.3c1.8 2.8 2.4 6.2 1.7 9l-2.8 1.4-1-2c-1.7.4-3.6.4-5.3 0l-1 2-2.8-1.4c-.7-2.8-.1-6.2 1.2-9Z" /><circle cx="11" cy="13.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="17" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></B>
)
export const IconMicrosoft = (p) => (
  <B {...p} strokeWidth={1.2}><rect x="4.5" y="4.5" width="9" height="9" rx="2" /><rect x="14.5" y="4.5" width="9" height="9" rx="2" /><rect x="4.5" y="14.5" width="9" height="9" rx="2" /><rect x="14.5" y="14.5" width="9" height="9" rx="2" /></B>
)
export const IconModrinth = (p) => (
  <B {...p}><circle cx="14" cy="14" r="10" /><path d="M9.5 17.5v-6l4.5 3.5 4.5-3.5v6" strokeWidth={1.8} /></B>
)
export const IconCurse = (p) => (
  <B {...p}><path d="M14 3.5c1 3.8 6 5 6 10a6 6 0 0 1-12 0c0-3.2 2.2-4.8 3.2-7 .2 2.2 2.8 2.8 2.8-3Z" /></B>
)

// --- software loader logos (image assets, untouched) ---
const FabricGlyph = ({ size = 28, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true"
    className={`loader-mark-img${className ? ` ${className}` : ''}`}
    style={{ flex: 'none', display: 'block', ...style }} fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="lm-fab2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#0ea5e9" />
    </linearGradient></defs>
    <path d="M8 23V6l13 17V6" stroke="url(#lm-fab2)" />
  </svg>
)

const LOADER_LOGO = {
  soul: './icons/loader/Soul.png',
  vanilla: './icons/space/crafting-table.png',
  fabric: './icons/loader/fabric.png',
  quilt: './icons/loader/quilt.png',
  forge: './icons/loader/forge.png',
  neoforge: './icons/loader/neoforge.png',
  optifine: './icons/loader/optifine.png',
}

const LOADER_LABELS = {
  soul: 'Soul Client', vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt',
  forge: 'Forge', neoforge: 'NeoForge', optifine: 'OptiFine',
}

const LogoMark = (src, label) => function LoaderMarkInner({ size = 28, className, style }) {
  const [dead, setDead] = useState(false)
  if (!src || dead) return <FabricGlyph size={size} className={className} style={style} />
  return (
    <img src={src} width={size} height={size} alt={label ? `${label} logo` : ''} draggable={false}
      onError={() => setDead(true)}
      aria-hidden={label ? undefined : true}
      className={`loader-mark-img${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, objectFit: 'contain', aspectRatio: '1/1', flex: 'none', display: 'block', ...style }} />
  )
}

export const LoaderMark = Object.fromEntries(
  Object.entries(LOADER_LOGO).map(([k, src]) => [k, LogoMark(src, LOADER_LABELS[k])])
)

export const LOADER_META = {
  soul: { label: 'Soul Client', desc: 'Tuned FPS build — 20+ performance mods' },
  vanilla: { label: 'Vanilla', desc: 'Pure Minecraft, zero extras' },
  fabric: { label: 'Fabric', desc: 'Lightweight modding, fast updates' },
  quilt: { label: 'Quilt', desc: 'The open fork of Fabric' },
  forge: { label: 'Forge', desc: 'The classic modding API' },
  neoforge: { label: 'NeoForge', desc: 'Community-driven Forge fork' },
  optifine: { label: 'OptiFine', desc: 'FPS boost & zoom' },
}

// --- space icons (real Minecraft block art, untouched) ---
export const SPACE_ICONS = [
  { id: 'soul', label: 'Soul Client' },
  { id: 'crafting-table', label: 'Crafting Table' },
  { id: 'diamond-block', label: 'Diamond Block' },
  { id: 'beacon', label: 'Beacon' },
  { id: 'enchanting-table', label: 'Enchanting Table' },
  { id: 'tnt', label: 'TNT' },
  { id: 'end-portal-frame', label: 'End Portal' },
  { id: 'crafter', label: 'Crafter' },
  { id: 'chain-command-block', label: 'Command Block' },
  { id: 'emerald-block', label: 'Emerald Block' },
  { id: 'amethyst-block', label: 'Amethyst' },
  { id: 'bookshelf', label: 'Bookshelf' },
  { id: 'carved-pumpkin', label: 'Pumpkin' },
  { id: 'fletching-table', label: 'Fletching Table' },
  { id: 'hay-block', label: 'Hay Bale' },
  { id: 'honey-block', label: 'Honey Block' },
  { id: 'lectern', label: 'Lectern' },
  { id: 'melon', label: 'Melon' },
  { id: 'piston', label: 'Piston' },
  { id: 'shulker-box', label: 'Shulker Box' },
  { id: 'target', label: 'Target' },
]
const SPACE_ICON_FILES = new Set(SPACE_ICONS.map((i) => i.id))

export const SPACE_ICON_KEYS = SPACE_ICONS.map((i) => i.id)

const LEGACY_SPACE_ICON_DEFS = {
  rocket: IconRocket, cube: IconCube, shield: IconShield, heart: IconHeart,
  bolt: IconBolt, star: IconSparkle, sword: IconEdit, gem: IconSparkle,
  castle: IconHome, pickaxe: IconHammer, volcano: IconWarn, snow: IconInfo,
  dragon: IconRocket, island: IconGlobe, skull: IconWarn, mushroom: IconHeart,
  anchor: IconLock,
}

export function SpaceIcon({ name, size = 30 }) {
  if (SPACE_ICON_FILES.has(name)) {
    return (
      <img src={`./icons/space/${name}.png`} width={size} height={size} alt="" draggable={false}
        style={{ width: size, height: size, objectFit: 'contain', aspectRatio: '1/1' }} />
    )
  }
  // Spaces saved with legacy v1 icon names still render via Lucide.
  const Def = LEGACY_SPACE_ICON_DEFS[name]
  if (Def) return <Def size={size} />
  return <img src="./icons/space/crafting-table.png" width={size} height={size} alt="" draggable={false}
    style={{ width: size, height: size, objectFit: 'contain', aspectRatio: '1/1' }} />
}

export const SPACE_COLORS = ['#5eead4', '#38bdf8', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f87171', '#2dd4bf']

export const McSun = IconSun
export const McMoon = IconMoon
