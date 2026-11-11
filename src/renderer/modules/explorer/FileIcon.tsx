import { extensionOf } from '@shared/paths'

const BADGES: Record<string, { label: string; color: string }> = {
  html: { label: '<>', color: '#e8743b' },
  htm: { label: '<>', color: '#e8743b' },
  css: { label: '#', color: '#4f9ee8' },
  scss: { label: '#', color: '#d16ba5' },
  js: { label: 'JS', color: '#e2c33c' },
  mjs: { label: 'JS', color: '#e2c33c' },
  cjs: { label: 'JS', color: '#e2c33c' },
  jsx: { label: 'JS', color: '#e2c33c' },
  ts: { label: 'TS', color: '#3f8cdb' },
  tsx: { label: 'TS', color: '#3f8cdb' },
  mts: { label: 'TS', color: '#3f8cdb' },
  json: { label: '{}', color: '#c9a227' },
  md: { label: 'M', color: '#8c96a8' },
  sql: { label: 'DB', color: '#38b2a3' },
  svg: { label: 'SV', color: '#e8a33b' },
  png: { label: 'IM', color: '#9b72e8' },
  jpg: { label: 'IM', color: '#9b72e8' },
  jpeg: { label: 'IM', color: '#9b72e8' },
  gif: { label: 'IM', color: '#9b72e8' },
  webp: { label: 'IM', color: '#9b72e8' }
}

export function FileIcon({ path }: { path: string }) {
  const badge = BADGES[extensionOf(path)] ?? { label: '·', color: 'var(--text-faint)' }
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: 18,
        fontSize: 9,
        fontWeight: 800,
        fontFamily: 'var(--font-code)',
        color: badge.color,
        flexShrink: 0
      }}
    >
      {badge.label}
    </span>
  )
}
