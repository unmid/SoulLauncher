// Paper-doodle icon set — thick ink strokes + candy fills, inspired by the
// "paper edition" mockup. Every icon strokes with var(--line) and fills with
// the paper palette so they adapt to light/dark themes automatically.
// Detailed 80px raster icons live in public/icons/{app,space,loader}.
// No emojis anywhere.
import { useEffect, useRef, useState } from 'react'

const S = ({ size = 20, children, style, className, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`ic${className ? ` ${className}` : ''}`}
    style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle', ...style }}
    {...rest}
  >
    {children}
  </svg>
)

/* Shared vertical candy gradient: 15% lighter at the top, 15% deeper at the
   bottom, derived from the theme palette so icons stay on-palette. */
const Grad = ({ id, c }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={`color-mix(in srgb, ${c} 86%, #fff)`} />
      <stop offset="1" stopColor={`color-mix(in srgb, ${c} 86%, #000)`} />
    </linearGradient>
  </defs>
)

// --- navigation ------------------------------------------------------------
export const IconHome = (p) => (
  <S {...p}><Grad id="g-home" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M5 10.8V20h14v-9.2" fill="url(#g-home)" />
    <path d="M2.8 11.6L12 3.8l9.2 7.8" fill="none" strokeLinecap="round" />
    <path d="M16.6 7V4.4h2.4v4.1" fill="var(--ic-orange)" />
    <path d="M6.4 11.2L12 6.4l5.6 4.8" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".35" />
    <rect x="10.2" y="14" width="3.6" height="6" rx=".7" fill="var(--card)" />
    <rect x="6.7" y="12.3" width="2.5" height="2.5" rx=".5" fill="var(--card)" />
    <path d="M8 12.3v2.5M6.7 13.55h2.5" strokeWidth="1.1" fill="none" />
  </g></S>
)
export const IconLayers = (p) => (
  <S {...p}><Grad id="g-layers" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 2.6l9 4.7-9 4.7-9-4.7z" fill="url(#g-layers)" />
    <path d="M5.4 8.2L12 4.9l6.6 3.3" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".4" />
    <path d="M4.4 10.2L12 13.9l7.6-3.7" fill="none" strokeWidth="1.2" opacity=".55" />
    <path d="M3 12.1l9 4.7 9-4.7M3 16.4l9 4.7 9-4.7" fill="none" />
  </g></S>
)
export const IconServer = (p) => (
  <S {...p}><Grad id="g-server" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.7">
    <rect x="3" y="3.8" width="18" height="7.4" rx="2" fill="url(#g-server)" />
    <rect x="3" y="12.8" width="18" height="7.4" rx="2" fill="url(#g-server)" />
    <path d="M4.6 5.4h14.8M4.6 14.4h14.8" stroke="#fff" strokeWidth="1" opacity=".22" fill="none" />
    <circle cx="6.8" cy="7.5" r="1.3" fill="var(--ic-green)" stroke="none" />
    <circle cx="10.3" cy="7.5" r="1" fill="var(--ic-yellow)" stroke="none" />
    <circle cx="6.8" cy="16.5" r="1.3" fill="var(--ic-green)" stroke="none" />
    <circle cx="10.3" cy="16.5" r="1" fill="var(--ic-red)" stroke="none" />
    <path d="M14 7.5h5.4M14 16.5h5.4" strokeLinecap="round" />
    <path d="M6 21.8v-1.2M18 21.8v-1.2" strokeLinecap="round" fill="none" />
  </g></S>
)
export const IconUser = (p) => (
  <S {...p}><Grad id="g-user-a" c="var(--ic-yellow)" /><Grad id="g-user-b" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <circle cx="12" cy="7.9" r="4.1" fill="url(#g-user-a)" />
    <path d="M8.4 6.4c.7-1.7 2.1-2.6 3.6-2.6 1.6 0 3 .9 3.6 2.7" fill="none" strokeWidth="1.3" opacity=".5" />
    <path d="M4 20.4c0-4.2 3.8-6.4 8-6.4s8 2.2 8 6.4z" fill="url(#g-user-b)" />
    <path d="M10 14.3l2 2.2 2-2.2" fill="none" stroke="var(--card)" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6.3 16.6c1-.9 2.4-1.5 3.9-1.7" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" />
  </g></S>
)
export const IconBolt = (p) => (
  <S {...p}><Grad id="g-bolt" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M13.2 2L5 13.5h5.2L8 22l9.2-11.5h-5.2z" fill="url(#g-bolt)" />
    <path d="M13.2 2L5 13.5h2.4L15 4.6z" fill="#fff" opacity=".28" stroke="none" />
  </g></S>
)
export const IconNews = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7">
    <rect x="4" y="4" width="16" height="16" rx="2.5" fill="var(--card)" />
    <path d="M8 8.6h8M8 12h8M8 15.4h4.6" fill="none" strokeLinecap="round" />
    <circle cx="16.6" cy="15.4" r="1.3" fill="var(--accent, var(--ic-orange))" stroke="none" />
  </g></S>
)
export const IconGear = (p) => (
  <S {...p}><g stroke="var(--line)" strokeLinecap="round">
    <g strokeWidth="2.7"><path d="M12 2.4v2.9M12 18.7v2.9M2.4 12h2.9M18.7 12h2.9M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2" fill="none" /></g>
    <circle cx="12" cy="12" r="5.4" fill="var(--ic-pink)" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="2.3" fill="var(--card)" strokeWidth="1.5" />
    <circle cx="12" cy="12" r=".7" fill="var(--line)" stroke="none" />
  </g></S>
)
export const IconUpdate = (p) => (
  <S {...p}><Grad id="g-update" c="var(--ic-green)" /><g stroke="var(--line)">
    <circle cx="12" cy="12" r="8.6" fill="url(#g-update)" strokeWidth="1.7" />
    <path d="M6.4 6.7A7.7 7.7 0 0 1 12 4.2" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".38" strokeLinecap="round" />
    <g fill="none" strokeWidth="2.1" strokeLinecap="round">
      <path d="M18.9 12a6.9 6.9 0 1 1-2-4.9" stroke="#fff" />
      <path d="M19.2 4.2v3.5h-3.5" stroke="#fff" />
    </g>
    <circle cx="12" cy="12" r="1" fill="#fff" stroke="none" opacity=".65" />
  </g></S>
)
export const IconKey = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="8" cy="12" r="4.4" fill="var(--ic-yellow)" />
    <circle cx="8" cy="12" r="1.5" fill="var(--card)" strokeWidth="1.3" />
    <path d="M12.5 12H21M18 12v3.5M21 12v2.5" fill="none" />
  </g></S>
)
export const IconBack = (p) => (
  <S {...p}><Grad id="g-back" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.5" y="4" width="17" height="16" rx="5" fill="url(#g-back)" />
    <path d="M5.5 6h13" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" strokeLinecap="round" />
    <path d="M11.5 8.2h6.2" fill="none" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M13.4 8.2l-4 3.8 4 3.8" fill="none" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M13 8.9l-1.4 1.5" fill="none" stroke="#fff" strokeWidth=".9" opacity=".5" strokeLinecap="round" />
  </g></S>
)

// --- actions / ui ------------------------------------------------------------
export const IconPlay = (p) => (
  <S {...p}><Grad id="g-play" c="var(--accent, var(--ic-orange))" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="5" fill="url(#g-play)" />
    <path d="M4.8 5.8h14.4" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".34" strokeLinecap="round" />
    <path d="M9.2 8.4v7.2L16.1 12z" fill="#fff" stroke="var(--card)" strokeWidth="1" />
    <path d="M10.3 9.3v2.4" fill="none" stroke="var(--accent, var(--ic-orange))" strokeWidth="1" opacity=".48" strokeLinecap="round" />
  </g></S>
)
export const IconPause = (p) => (
  <S {...p}><Grad id="g-pause" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="4" y="4" width="16" height="16" rx="5.5" fill="url(#g-pause)" />
    <rect x="8.1" y="7" width="3" height="10" rx="1.4" fill="var(--accent, var(--ic-orange))" />
    <rect x="12.9" y="7" width="3" height="10" rx="1.4" fill="var(--accent, var(--ic-orange))" />
    <path d="M8.9 7.9v2.2M13.7 7.9v2.2" stroke="#fff" opacity=".65" strokeWidth=".9" strokeLinecap="round" fill="none" />
  </g></S>
)
export const IconPlus = (p) => (
  <S {...p}><Grad id="g-plus" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="5.5" fill="url(#g-plus)" />
    <path d="M6 6.2h12" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".34" strokeLinecap="round" />
    <path d="M12 8v8" fill="none" stroke="var(--accent, var(--ic-orange))" strokeWidth="2.7" strokeLinecap="round" />
    <path d="M8 12h8" fill="none" stroke="var(--accent, var(--ic-orange))" strokeWidth="2.7" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1.25" fill="#fff" stroke="none" opacity=".85" />
  </g></S>
)
export const IconEdit = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M4 20l1.2-4.8L16.7 3.7a2.1 2.1 0 0 1 3 3L8.2 18.2z" fill="var(--ic-yellow)" />
    <path d="M14.6 5.8l3 3" fill="none" strokeWidth="1.3" />
    <path d="M4 20l1.2-4.8 2.9 2.9z" fill="var(--card)" />
    <path d="M16.7 3.7a2.1 2.1 0 0 1 3 3l-1 1-3-3z" fill="var(--ic-pink)" />
  </g></S>
)
export const IconCopy = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" />
    <rect x="8" y="8" width="12" height="12" rx="2" fill="var(--card)" />
    <path d="M11.5 12h5M11.5 15h5M11.5 18h3" fill="none" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
  </g></S>
)
export const IconTrash = (p) => (
  <S {...p}><Grad id="g-trash" c="var(--ic-red)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" fill="var(--paper2)" />
    <path d="M4.5 7h15" strokeLinecap="round" fill="none" />
    <path d="M6.8 7l.9 13h8.6l.9-13z" fill="url(#g-trash)" />
    <path d="M10.2 10.5v6M13.8 10.5v6" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path d="M8 8.2l.2 2" fill="none" stroke="#fff" strokeWidth="1" opacity=".3" />
  </g></S>
)
export const IconSearch = (p) => (
  <S {...p}><Grad id="g-search" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.8" fill="none">
    <circle cx="10.5" cy="10.5" r="6.4" fill="var(--card)" />
    <path d="M7.2 8.8a4.2 4.2 0 0 1 3-2.8" strokeWidth="1.3" strokeLinecap="round" opacity=".65" />
    <path d="M8.1 12.3a3.5 3.5 0 0 0 3.3 2.6" strokeWidth="1.2" strokeLinecap="round" opacity=".38" />
    <path d="M15.1 15.1l1.7 1.7" strokeLinecap="round" stroke="var(--accent, var(--ic-orange))" strokeWidth="2.8" opacity=".9" />
    <path d="M15.3 15.3l5 5" strokeLinecap="round" strokeWidth="2.3" />
    <circle cx="10.5" cy="10.5" r="1" fill="url(#g-search)" stroke="none" opacity=".55" />
  </g></S>
)
export const IconX = (p) => (
  <S {...p}><Grad id="g-x" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="5.5" fill="url(#g-x)" />
    <path d="M6 6.2h12" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" strokeLinecap="round" />
    <path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" fill="none" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M8.8 8.8l2.4 2.4M15.2 8.8l-2.4 2.4" fill="none" stroke="#fff" strokeWidth=".95" opacity=".55" strokeLinecap="round" />
  </g></S>
)
export const IconCheck = (p) => (
  <S {...p}><Grad id="g-check" c="var(--ic-green)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.6" fill="url(#g-check)" />
    <path d="M6.5 6.8A7.8 7.8 0 0 1 12 4.2" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".42" strokeLinecap="round" />
    <path d="M8 12.6l3 3.1 5.2-6.2" fill="none" stroke="#fff" strokeWidth="2.7" strokeLinecap="round" />
    <path d="M8 12.6l1.6 1.7" fill="none" stroke="var(--card)" strokeWidth="1" opacity=".55" strokeLinecap="round" />
  </g></S>
)
export const IconFolder = (p) => (
  <S {...p}><Grad id="g-folder" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.5H21V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" fill="url(#g-folder)" />
    <path d="M3 10.5h18" fill="none" strokeWidth="1.3" opacity=".5" />
    <path d="M4.5 5h5l2 2.5" fill="none" />
    <path d="M5 12.4h14" fill="none" stroke="#fff" strokeWidth="1" opacity=".25" />
  </g></S>
)
export const IconDownload = (p) => (
  <S {...p}><Grad id="g-download" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.5" fill="url(#g-download)" />
    <path d="M5.8 5.8h12.4" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".34" strokeLinecap="round" />
    <path d="M12 7.3v6.7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M8.6 11.4L12 14.8l3.4-3.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.3 16.5v1.2a1.5 1.5 0 0 0 1.5 1.5h8.4a1.5 1.5 0 0 0 1.5-1.5v-1.2" fill="none" strokeWidth="1.8" strokeLinecap="round" />
  </g></S>
)
export const IconUpload = (p) => (
  <S {...p}><Grad id="g-upload" c="var(--ic-green)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.5" fill="url(#g-upload)" />
    <path d="M5.8 5.8h12.4" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".32" strokeLinecap="round" />
    <path d="M12 14.6V7.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M8.6 10.5L12 7.1l3.4 3.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.3 16.5v1.2a1.5 1.5 0 0 0 1.5 1.5h8.4a1.5 1.5 0 0 0 1.5-1.5v-1.2" fill="none" strokeWidth="1.8" strokeLinecap="round" />
  </g></S>
)
export const IconImport = (p) => (
  <S {...p}><Grad id="g-import" c="var(--ic-violet)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.5" fill="url(#g-import)" />
    <path d="M5.8 5.8h12.4" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".32" strokeLinecap="round" />
    <rect x="7" y="10.8" width="10" height="7" rx="1.8" fill="var(--card)" />
    <path d="M12 7.2v5.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M9.2 10.2L12 13l2.8-2.8" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
  </g></S>
)
export const IconShare = (p) => (
  <S {...p}><Grad id="g-share" c="var(--ic-pink)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.5" fill="url(#g-share)" />
    <path d="M5.8 5.8h12.4" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".32" strokeLinecap="round" />
    <rect x="7" y="6.6" width="10" height="7" rx="1.8" fill="var(--card)" />
    <path d="M12 16.6v-5.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M9.2 13.6L12 10.8l2.8 2.8" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
  </g></S>
)
export const IconMore = (p) => (
  <S {...p}><Grad id="g-more" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.6" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="5.5" fill="url(#g-more)" />
    <path d="M6 6.1h12" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" strokeLinecap="round" />
    <g stroke="none">
      <circle cx="12" cy="8" r="2" fill="var(--line)" />
      <circle cx="12" cy="12" r="2" fill="var(--line)" />
      <circle cx="12" cy="16" r="2" fill="var(--line)" />
      <circle cx="11.35" cy="7.35" r=".55" fill="#fff" opacity=".72" />
      <circle cx="11.35" cy="11.35" r=".55" fill="#fff" opacity=".72" />
      <circle cx="11.35" cy="15.35" r=".55" fill="#fff" opacity=".72" />
    </g>
  </g></S>
)
export const IconClock = (p) => (
  <S {...p}><Grad id="g-clock" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.7">
    <circle cx="12" cy="12" r="8.5" fill="url(#g-clock)" />
    <path d="M6.2 6.4A7.5 7.5 0 0 1 12 4.5" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".35" />
    <path d="M12 5.4v1.4M18.6 12h-1.4M12 18.6v-1.4M5.4 12h1.4" fill="none" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
    <path d="M12 7.4V12l3.3 2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="1" fill="var(--line)" stroke="none" />
  </g></S>
)
export const IconGlobe = (p) => (
  <S {...p}><Grad id="g-globe" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.6">
    <circle cx="12" cy="12" r="8.5" fill="url(#g-globe)" />
    <path d="M6.3 6a7.6 7.6 0 0 1 5.7-2.4" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />
    <path d="M3.5 12h17M4.8 7.2h14.4M4.8 16.8h14.4" fill="none" strokeWidth="1.2" opacity=".7" />
    <path d="M12 3.5c3 2.5 3 14.5 0 17-3-2.5-3-14.5 0-17z" fill="none" />
  </g></S>
)
export const IconShield = (p) => (
  <S {...p}><Grad id="g-shield" c="var(--ic-green)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 3l7 2.5V12c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V5.5z" fill="url(#g-shield)" />
    <path d="M12 5.2l5 1.8v5c0 3.5-2.3 5.8-5 7-2.7-1.2-5-3.5-5-7V7z" fill="none" strokeWidth="1.1" opacity=".55" />
    <path d="M9 11.5l2.3 2.5L15.5 9" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 3.6L7.5 5.3" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".4" />
  </g></S>
)
export const IconLock = (p) => (
  <S {...p}><Grad id="g-lock" c="var(--ic-violet)" /><g stroke="var(--line)" strokeWidth="1.7">
    <rect x="5" y="11" width="14" height="9" rx="2" fill="url(#g-lock)" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" />
    <path d="M6.2 12.6h5" stroke="#fff" strokeWidth="1.1" opacity=".3" fill="none" strokeLinecap="round" />
    <circle cx="12" cy="15" r="1.6" fill="var(--card)" stroke="none" />
    <path d="M12 15.8v1.7" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </g></S>
)
export const IconMusic = (p) => (
  <S {...p}><Grad id="g-music" c="var(--ic-pink)" /><g stroke="var(--line)" strokeWidth="1.7">
    <path d="M9 17.5V6.2l10-2.7v11.3" fill="none" />
    <path d="M9 9.2l10-2.6" fill="none" strokeWidth="1.2" opacity=".55" />
    <circle cx="6.8" cy="17.7" r="2.6" fill="url(#g-music)" />
    <circle cx="16.8" cy="15.2" r="2.6" fill="url(#g-music)" />
    <circle cx="6" cy="16.9" r=".8" fill="#fff" opacity=".45" stroke="none" />
    <circle cx="16" cy="14.4" r=".8" fill="#fff" opacity=".45" stroke="none" />
  </g></S>
)
export const IconGamepad = (p) => (
  <S {...p}><Grad id="g-pad" c="var(--ic-violet)" /><g stroke="var(--line)" strokeWidth="1.7">
    <path d="M7 7h10c3 0 5 2.5 5 6s-2 5-4 4l-2-2H8l-2 2c-2 1-4-.5-4-4s2-6 5-6z" fill="url(#g-pad)" />
    <path d="M7.4 8.2c2.5-.6 6.7-.6 9.2 0" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" />
    <path d="M8 10.5v4M6 12.5h4" stroke="var(--card)" strokeLinecap="round" />
    <circle cx="15.8" cy="10.9" r="1.3" fill="var(--card)" stroke="none" />
    <circle cx="18" cy="13.3" r="1.3" fill="var(--card)" stroke="none" />
    <circle cx="13.6" cy="13.3" r=".9" fill="var(--card)" stroke="none" opacity=".7" />
  </g></S>
)
export const IconBrush = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M14 3l7 7-9.5 2.5a2.6 2.6 0 0 1-1.9-.66c-.66-.66-.84-1.63-.52-2.47z" fill="var(--ic-violet)" />
    <path d="M15.6 4.8l3.8 3.8" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".4" />
    <path d="M7 13c-2.5.8-4 2.8-4 6 1.8.8 4 .3 5.2-1S9.6 14.4 7 13z" fill="var(--ic-pink)" />
    <path d="M5.2 16.8c.9.4 1.8.3 2.6-.2" fill="none" stroke="var(--line)" strokeWidth="1" opacity=".6" />
  </g></S>
)
export const IconCape = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M8 4h8l2 14c-4 2-8 2-12 0z" fill="var(--ic-red)" />
    <path d="M12 6.2v11.4" fill="none" strokeWidth="1.1" opacity=".5" />
    <circle cx="10" cy="4" r="1.2" fill="var(--ic-yellow)" />
    <circle cx="14" cy="4" r="1.2" fill="var(--ic-yellow)" />
  </g></S>
)
export const IconHeart = (p) => (
  <S {...p}><Grad id="g-heart" c="var(--ic-pink)" /><g stroke="var(--line)" strokeWidth="1.7">
    <path d="M12 20s-8-5-8-10.5C4 6 6.5 4 9 4c1.5 0 3 1 3 2.5C12 5 13.5 4 15 4c2.5 0 5 2 5 5.5C20 15 12 20 12 20z" fill="url(#g-heart)" />
    <path d="M7.2 9.2c.3-1.8 1.6-2.9 3-3" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />
  </g></S>
)
export const IconHammer = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><rect x="9" y="3" width="11" height="6" rx="2" fill="var(--paper2)" transform="rotate(35 14 6)" /><path d="M9 13L3.5 18.5a2 2 0 0 0 3 3L12 16" fill="var(--ic-yellow)" /></g></S>
)
export const IconCpu = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="6" y="6" width="12" height="12" rx="2" fill="var(--ic-blue)" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="var(--card)" />
    <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" fill="none" strokeLinecap="round" />
    <circle cx="12" cy="12" r=".8" fill="var(--line)" stroke="none" />
  </g></S>
)
export const IconRam = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="3" y="8" width="18" height="8" rx="2" fill="var(--ic-pink)" />
    <path d="M7 11v3M11 11v3M15 11v3" fill="none" strokeLinecap="round" />
    <path d="M5 16v2.4M9 16v2.4M13 16v2.4M17 16v2.4" fill="none" strokeWidth="1.4" strokeLinecap="round" />
  </g></S>
)
export const IconGpu = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="3" y="7" width="18" height="10" rx="2" fill="var(--ic-green)" />
    <circle cx="10" cy="12" r="3.2" fill="var(--card)" />
    <path d="M10 9.6v4.8M8.3 10.8l3.4 2.4M11.7 10.8l-3.4 2.4" strokeWidth="1" fill="none" opacity=".7" />
    <path d="M16.5 9.8v4.4M18.8 9.8v4.4" fill="none" strokeLinecap="round" />
  </g></S>
)
export const IconOs = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="3.5" y="4.5" width="17" height="14" rx="2" fill="var(--card)" />
    <path d="M3.5 8.5h17" /><circle cx="6.2" cy="6.5" r=".7" fill="var(--line)" stroke="none" /><circle cx="8.4" cy="6.5" r=".7" fill="var(--line)" stroke="none" />
    <path d="M9 21h6M12 18.5V21" fill="none" strokeLinecap="round" />
  </g></S>
)
export const IconSparkle = (p) => (
  <S {...p}><Grad id="g-spark" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2L6.4 20l1.3-6.2L3 9.5l6.3-.7z" fill="url(#g-spark)" />
    <path d="M12 6.2l1.8 3.9 4.3.5" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".4" strokeLinecap="round" />
    <path d="M17.5 2.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="url(#g-spark)" strokeWidth="1" />
  </g></S>
)
export const IconStar = IconSparkle
export const IconDisk = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.6">
    <rect x="3" y="5" width="18" height="14" rx="2.5" fill="var(--card)" />
    <circle cx="10" cy="12" r="3.6" fill="var(--inset)" />
    <circle cx="10" cy="12" r="1.2" fill="var(--card)" strokeWidth="1.2" />
    <path d="M15.5 15.5l3-3" fill="none" strokeLinecap="round" />
    <circle cx="19" cy="8" r=".8" fill="var(--line)" stroke="none" />
  </g></S>
)
export const IconExternal = (p) => (
  <S {...p}><Grad id="g-external" c="var(--card)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.5" fill="url(#g-external)" />
    <path d="M5.8 5.8H18" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".3" strokeLinecap="round" />
    <rect x="7" y="7" width="9.5" height="9.5" rx="2.3" fill="none" strokeWidth="1.7" />
    <path d="M10.2 13.8L17 7" fill="none" stroke="var(--accent, var(--ic-orange))" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M12.7 7H17v4.3" fill="none" stroke="var(--accent, var(--ic-orange))" strokeWidth="2.3" strokeLinecap="round" />
  </g></S>
)
export const IconRefresh = (p) => (
  <S {...p}><Grad id="g-refresh" c="var(--card)" /><g stroke="var(--line)">
    <circle cx="12" cy="12" r="8.6" fill="url(#g-refresh)" strokeWidth="1.7" />
    <path d="M6.4 6.7A7.7 7.7 0 0 1 12 4.2" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".38" strokeLinecap="round" />
    <g strokeWidth="2.1" strokeLinecap="round" fill="none">
      <path d="M18.9 12a6.9 6.9 0 1 1-2-4.9" stroke="var(--accent, var(--ic-orange))" />
      <path d="M19.2 4.2v3.5h-3.5" stroke="var(--accent, var(--ic-orange))" />
    </g>
  </g></S>
)
export const IconCube = (p) => (
  <S {...p}><Grad id="g-cube" c="var(--ic-violet)" /><Grad id="g-cubetop" c="var(--ic-pink)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="url(#g-cube)" />
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" fill="url(#g-cubetop)" />
    <path d="M12 12v9" fill="none" />
    <path d="M12 12l8-4.5M12 12L4 7.5" fill="none" strokeWidth="1.1" opacity=".55" />
    <path d="M12 4.2l6.8 3.8" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".35" />
  </g></S>
)
export const IconPlayers = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7">
    <circle cx="9" cy="8" r="3.6" fill="var(--ic-yellow)" />
    <path d="M2.5 19c0-3.4 3.2-5 6.5-5s6.5 1.6 6.5 5z" fill="var(--ic-blue)" />
    <circle cx="17" cy="9.5" r="2.8" fill="var(--ic-green)" />
    <path d="M16 14.6c2.9.3 5 1.8 5 4.4h-4" fill="var(--ic-green)" />
  </g></S>
)
export const IconSignal = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.7"><rect x="3" y="13" width="4" height="7" rx="1.5" fill="var(--ic-red)" /><rect x="10" y="9" width="4" height="11" rx="1.5" fill="var(--ic-yellow)" /><rect x="17" y="4" width="4" height="16" rx="1.5" fill="var(--ic-green)" /></g></S>
)
export const IconInfo = (p) => (
  <S {...p}><Grad id="g-info" c="var(--ic-blue)" /><g stroke="var(--line)" strokeWidth="1.7"><circle cx="12" cy="12" r="8.5" fill="url(#g-info)" /><path d="M6.4 6.2A7.6 7.6 0 0 1 12 4.4" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".4" /><path d="M12 11v5" fill="none" stroke="var(--card)" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="8" r="1.3" fill="var(--card)" stroke="none" /></g></S>
)
export const IconWarn = (p) => (
  <S {...p}><Grad id="g-warn" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7"><path d="M12 3.5L22 20H2z" fill="url(#g-warn)" strokeLinejoin="round" /><path d="M12 4.6L6.8 13" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".35" /><path d="M12 9.5v4.5" fill="none" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.2" fill="var(--line)" stroke="none" /></g></S>
)
export const IconRocket = (p) => (
  <S {...p}><Grad id="g-rocket" c="var(--ic-orange)" /><Grad id="g-flame" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 2c3.2 2 5 6 5 10l-2.6 3h-4.8L7 12c0-4 1.8-8 5-10z" fill="url(#g-rocket)" />
    <path d="M12 2c1.4.9 2.6 2.4 3.4 4.4L9.9 5.4C10.6 4 11.2 2.9 12 2z" fill="#fff" opacity=".25" stroke="none" />
    <circle cx="12" cy="10" r="2.3" fill="var(--card)" />
    <circle cx="12" cy="10" r="1" fill="var(--ic-blue)" stroke="none" />
    <path d="M7.5 13L5 17l3.4-1M16.5 13L19 17l-3.4-1" fill="url(#g-flame)" />
    <path d="M10.4 17.5L12 22l1.6-4.5" fill="url(#g-flame)" />
    <path d="M11.2 17.9L12 20l.8-2.1" fill="var(--ic-orange)" stroke="none" />
  </g></S>
)
export const IconSun = (p) => (
  <S {...p}><Grad id="g-sun" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.4" fill="url(#g-sun)" />
    <circle cx="12" cy="12" r="2" fill="none" strokeWidth="1.1" opacity=".5" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4" fill="none" />
  </g></S>
)
export const IconMoon = (p) => (
  <S {...p}><Grad id="g-moon" c="var(--ic-yellow)" /><g stroke="var(--line)" strokeWidth="1.7">
    <path d="M20 14.5A8.5 8.5 0 1 1 10.5 4a7 7 0 0 0 9.5 10.5z" fill="url(#g-moon)" />
    <circle cx="9.5" cy="10" r="1.1" fill="none" strokeWidth="1" opacity=".5" />
    <circle cx="11.5" cy="14.5" r=".8" fill="none" strokeWidth="1" opacity=".5" />
  </g></S>
)

// --- social ------------------------------------------------------------------
export const IconGithub = (p) => (
  <S {...p}><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.11-.75.4-1.26.72-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" fill="var(--line)" /></S>
)
export const IconDiscord = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.8"><path d="M7 7.5C9 6.3 10.5 6 12 6s3 .3 5 1.5c2 3 2.6 6.6 1.8 9.5l-3 1.5-1-2c-1.8.4-3.8.4-5.6 0l-1 2-3-1.5C4.4 14.1 5 10.5 7 7.5z" fill="var(--ic-blue)" /><circle cx="9.5" cy="12" r="1.5" fill="var(--card)" stroke="none" /><circle cx="14.5" cy="12" r="1.5" fill="var(--card)" stroke="none" /></g></S>
)
export const IconMicrosoft = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.4"><rect x="3.5" y="3.5" width="8" height="8" fill="#f25022" /><rect x="12.5" y="3.5" width="8" height="8" fill="#7fba00" /><rect x="3.5" y="12.5" width="8" height="8" fill="#00a4ef" /><rect x="12.5" y="12.5" width="8" height="8" fill="#ffb900" /></g></S>
)
export const IconModrinth = (p) => (
  <S {...p}><g stroke="var(--line)" strokeWidth="1.8"><circle cx="12" cy="12" r="9" fill="#21bf4e" /><path d="M8.5 15.5v-5l3.5 3 3.5-3v5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></g></S>
)
export const IconCurse = (p) => (
  <S {...p}><path d="M12 2.5c1 3.5 5.5 4.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-3 2-4.5 3-6.5.2 2 2.5 2.5 2.5-3z" fill="var(--ic-orange)" stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round" /></S>
)

// --- loader logos (real logos from public/icons/loader) --------------------------
const LOADER_LOGO = {
  soul: './icons/space/soul.png',
  vanilla: './icons/space/crafting-table.png',
  fabric: './icons/loader/fabric.png',
  quilt: './icons/loader/quilt.png',
  forge: './icons/loader/forge.png',
  neoforge: './icons/loader/neoforge.png',
  optifine: './icons/loader/optifine.png',
}
const LogoMark = (src) => function LogoMarkInner({ size = 20 }) {
  return <img src={src} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain', borderRadius: Math.round(size / 6) }} />
}
export const LoaderMark = Object.fromEntries(
  Object.entries(LOADER_LOGO).map(([k, src]) => [k, LogoMark(src)])
)

export const LOADER_META = {
  soul: { label: 'Soul Client', desc: 'Our tuned FPS build on Fabric — 20+ performance mods' },
  vanilla: { label: 'Vanilla', desc: 'Pure Minecraft, zero extras' },
  fabric: { label: 'Fabric', desc: 'Lightweight modding, fast updates' },
  quilt: { label: 'Quilt', desc: 'The open fork of Fabric' },
  forge: { label: 'Forge', desc: 'The classic modding API' },
  neoforge: { label: 'NeoForge', desc: 'Community-driven Forge fork' },
  optifine: { label: 'OptiFine', desc: 'FPS boost & zoom' },
}

// --- space icons (real Minecraft block art from public/icons/space) -------------
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

// legacy hand-drawn defs kept so Spaces saved with old icon names still render
const LEGACY_SPACE_ICON_DEFS = {
  rocket: IconRocket,
  cube: IconCube,
  sword: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 19L17 7l2 2L7 21z" fill="var(--card)" /><path d="M14 3l2 3 3 2 2-2-4.5-4.5z" fill="var(--ic-yellow)" /><path d="M5 15l4 4" fill="none" /></g></S>,
  shield: IconShield,
  gem: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l6.5 5.5L12 21 5.5 8.5z" fill="var(--ic-blue)" /><path d="M5.5 8.5h13M12 3l-2.5 5.5L12 21l2.5-12.5z" fill="none" /></g></S>,
  castle: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 21V9l3-2 2 3 2-5 2 5 2-3 3 2v12z" fill="var(--paper2)" /><path d="M10 21v-4h4v4" fill="var(--ic-yellow)" /></g></S>,
  pickaxe: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 21L13 11" strokeWidth="2.4" strokeLinecap="round" fill="none" /><path d="M11.5 10C14 5.5 18 4 21 4.5c-1 4-3.5 7.5-7.5 9" fill="var(--card)" /></g></S>,
  volcano: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M8 9L3 20h18L16 9z" fill="var(--paper2)" /><path d="M10 9c-1-2 1-3 0-5s3-2 3 1-1 3-1 4z" fill="var(--ic-orange)" /></g></S>,
  snow: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9" /></g></S>,
  heart: IconHeart,
  dragon: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 18c5 0 12-1 15-6l2-2-2 5-3 1" fill="var(--ic-green)" /><path d="M6 15L4 8c4 0 9 1 12 4z" fill="var(--ic-green)" /><circle cx="9" cy="12.5" r="1" fill="var(--line)" stroke="none" /></g></S>,
  island: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M2 19c3-2 6-2 10 0s7 2 10 0" fill="none" strokeLinecap="round" /><path d="M12 13V7" fill="none" strokeLinecap="round" /><path d="M12 7C9 7 8 4.5 8 3c2.5 0 4 1.5 4 4 0-2.5 1.5-4 4-4 0 1.5-1 4-4 4z" fill="var(--ic-green)" /></g></S>,
  bolt: IconBolt,
  skull: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8"><path d="M12 3a8 8 0 0 0-8 8c0 2.2 1 4.2 2.6 5.6L7 21h10l.4-4.4A7.97 7.97 0 0 0 20 11a8 8 0 0 0-8-8z" fill="var(--card)" /><circle cx="9" cy="11" r="1.6" fill="var(--line)" stroke="none" /><circle cx="15" cy="11" r="1.6" fill="var(--line)" stroke="none" /></g></S>,
  star: IconSparkle,
  mushroom: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3C6.5 3 3 6.5 3 10h18c0-3.5-3.5-7-9-7z" fill="var(--ic-red)" /><circle cx="8.5" cy="6.5" r="1.4" fill="var(--card)" stroke="none" /><circle cx="14.5" cy="5.8" r="1.1" fill="var(--card)" stroke="none" /><path d="M9.5 10v5c0 3.5 5 3.5 5 0v-5z" fill="var(--card)" /></g></S>,
  anchor: (p) => <S {...p}><g stroke="var(--line)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="5" r="2.6" fill="var(--card)" /><path d="M12 8v13" fill="none" /><path d="M4 14a8 8 0 0 0 16 0M4 14v-3m16 3v-3" fill="none" /></g></S>,
}
export const SPACE_ICON_KEYS = SPACE_ICONS.map((i) => i.id)

export function SpaceIcon({ name, size = 30 }) {
  if (SPACE_ICON_FILES.has(name)) {
    return (
      <img
        src={`./icons/space/${name}.png`}
        width={size}
        height={size}
        alt=""
        draggable={false}
        style={{ objectFit: 'contain' }}
      />
    )
  }
  // Older saved Spaces can still contain hand-drawn names. New or unknown
  // names use a real block asset instead of silently falling back to a rocket.
  const Def = LEGACY_SPACE_ICON_DEFS[name]
  if (Def) return <Def size={size} />
  return <img src="./icons/space/crafting-table.png" width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain' }} />
}

export const SPACE_COLORS = ['#f26a3c', '#3ea1d9', '#eeb64d', '#ef8fa5', '#71b06c', '#8d7ae0', '#e0503a', '#4fc4b5']

// Legacy pixel-family shims (kept so stale imports don't explode): sun/moon only.
export const McSun = IconSun
export const McMoon = IconMoon

/* ============================================================================
   App icons: crisp vector icons wherever one exists, raster only for legacy
   animated states. Every icon exists as <name>.png; icons that have a matching
   <name>.gif play the animation while pressed (or while `active` is forced true).
   ========================================================================== */
const VECTOR_APP_ICONS = {
  home: IconHome,
  grid: IconLayers,
  list: IconServer,
  user: IconUser,
  tune: IconGear,
  download: IconDownload,
  upload: IconUpload,
  import: IconImport,
  add: IconPlus,
  trash: IconTrash,
  'update-available': IconUpdate,
  boost: IconBolt,
  process: IconCpu,
}
const APP_ICONS_WITH_GIF = new Set([
  'add', 'favorite-add', 'checkbox-on', 'check', 'done', 'download',
  'installing', 'loading', 'menu', 'notification', 'process', 'trash',
  'tune', 'upload',
])

export function appIconUrl(name, animated = false) {
  return `./icons/app/${name}.${animated ? 'gif' : 'png'}`
}

export function AppIcon({ name, size = 20, active = false, alt = '', style, ...rest }) {
  const Vector = VECTOR_APP_ICONS[name]
  if (Vector) {
    return (
      <span
        className="app-icon-vector"
        style={{ width: size, height: size, ...style }}
        role="img"
        aria-label={alt || undefined}
      >
        <Vector size={size} {...rest} />
      </span>
    )
  }
  const [pressed, setPressed] = useState(false)
  const hasGif = APP_ICONS_WITH_GIF.has(name)
  const animated = hasGif && (active || pressed)
  useEffect(() => {
    if (!pressed) return
    const up = () => setPressed(false)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [pressed])
  return (
    <img
      src={appIconUrl(name, animated)}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      className="app-icon"
      onPointerDown={hasGif ? () => setPressed(true) : undefined}
      style={{ objectFit: 'contain', verticalAlign: 'middle', flex: 'none', ...style }}
      {...rest}
    />
  )
}
