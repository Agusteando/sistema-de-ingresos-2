import manifest from './talleresArtwork.manifest.json'

type SpriteCell = readonly [number, number]

const cells = manifest.cells as Record<string, SpriteCell>
const aliases = manifest.aliases as Record<string, string>

export const normalizeTallerArtworkKey = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/^TRANSPORTE_SIMPLE_(R\d+)$/, 'TRANSPORTE_SENCILLO_$1')

export const resolveTallerArtworkKey = (value: unknown) => {
  const normalized = normalizeTallerArtworkKey(value)
  const canonical = aliases[normalized] || normalized
  return cells[canonical] ? canonical : manifest.generic
}

export const hasDedicatedTallerArtwork = (value: unknown) => resolveTallerArtworkKey(value) !== manifest.generic

export const tallerArtworkStyle = (value: unknown) => {
  const key = resolveTallerArtworkKey(value)
  const [column, row] = cells[key] || cells[manifest.generic]
  const x = manifest.columns > 1 ? (column / (manifest.columns - 1)) * 100 : 0
  const y = manifest.rows > 1 ? (row / (manifest.rows - 1)) * 100 : 0

  return {
    backgroundImage: `url("${manifest.sprite}")`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundSize: `${manifest.columns * 100}% ${manifest.rows * 100}%`,
  }
}

export const TALLER_ARTWORK_MANIFEST = manifest
