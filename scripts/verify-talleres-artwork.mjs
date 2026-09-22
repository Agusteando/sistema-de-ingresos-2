import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DEFAULT_TALLERES_SERVICIOS } from '../shared/utils/talleresServicios.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(`${root}/shared/utils/talleresArtwork.manifest.json`, 'utf8'))
const sprite = await readFile(`${root}/public${manifest.sprite}`)

const normalize = (value) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/^TRANSPORTE_SIMPLE_(R\d+)$/, 'TRANSPORTE_SENCILLO_$1')

const resolve = (value) => {
  const key = normalize(value)
  const canonical = manifest.aliases[key] || key
  return manifest.cells[canonical] ? canonical : manifest.generic
}

assert.equal(manifest.version, 1)
assert.equal(manifest.columns, 8)
assert.equal(manifest.rows, 8)
assert.equal(manifest.cellSize, 224)
assert.deepEqual(manifest.cells[manifest.generic], [2, 7])
assert.equal(createHash('sha256').update(sprite).digest('hex'), manifest.sha256)

assert.equal(sprite.subarray(0, 4).toString('ascii'), 'RIFF')
assert.equal(sprite.subarray(8, 12).toString('ascii'), 'WEBP')
const webpChunk = sprite.subarray(12, 16).toString('ascii')
const dimensions = webpChunk === 'VP8L'
  ? (() => {
      const bits = sprite.readUInt32LE(21)
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
    })()
  : webpChunk === 'VP8X'
    ? [sprite.readUIntLE(24, 3) + 1, sprite.readUIntLE(27, 3) + 1]
    : null
assert.ok(dimensions, `Unsupported WebP chunk ${webpChunk}`)
assert.equal(dimensions[0], manifest.columns * manifest.cellSize)
assert.equal(dimensions[1], manifest.rows * manifest.cellSize)

const occupied = new Set()
for (const [key, cell] of Object.entries(manifest.cells)) {
  assert.equal(Array.isArray(cell), true, `${key} must point to a sprite cell`)
  assert.equal(cell.length, 2, `${key} must have [column, row]`)
  assert.ok(cell[0] >= 0 && cell[0] < manifest.columns, `${key} column is outside the sprite`)
  assert.ok(cell[1] >= 0 && cell[1] < manifest.rows, `${key} row is outside the sprite`)
  const coordinate = cell.join(':')
  assert.equal(occupied.has(coordinate), false, `${key} duplicates sprite cell ${coordinate}`)
  occupied.add(coordinate)
}

for (const service of DEFAULT_TALLERES_SERVICIOS) {
  assert.notEqual(resolve(service.clave), manifest.generic, `Missing dedicated artwork for ${service.clave}`)
}

const liveInventory = [
  'AJEDREZ', 'BASQUETBOL', 'BE_AN_ARTIST', 'BE_AN_ARTIST_2_DIAS', 'CENA',
  'CLUB_DE_TAREAS', 'COMIDA', 'DANZA_ARABE', 'FRANCES', 'FUTBOL', 'INGLES',
  'JAZZ_KIDS', 'JAZZ_REPRESENTATIVO', 'TAE_KWON_DO', 'TEATRO_MUSICAL', 'TECLADO',
  'TENIS', 'TE_0_5H', 'TE_1H', 'TE_1_5H', 'TE_2H', 'TE_3H', 'TE_3_5H', 'TE_4H',
  'TOCHITO_BANDERA', 'TRANSPORTE_REDONDO_R1', 'TRANSPORTE_REDONDO_R2',
  'TRANSPORTE_REDONDO_R5', 'TRANSPORTE_REDONDO_R6', 'TRANSPORTE_SENCILLO_R1',
  'TRANSPORTE_SENCILLO_R2', 'TRANSPORTE_SENCILLO_R3', 'TRANSPORTE_SENCILLO_R4',
  'TRANSPORTE_SENCILLO_R5', 'TRANSPORTE_SENCILLO_R6', 'VOLEIBOL',
]
for (const key of liveInventory) {
  assert.notEqual(resolve(key), manifest.generic, `Live inventory key ${key} fell back to generic artwork`)
}

assert.equal(resolve('TENNIS'), 'TENIS')
assert.equal(resolve('TRANSPORTE SIMPLE R3'), 'TRANSPORTE_SENCILLO_R3')
assert.equal(resolve('FUTURO_TALLER_INSTITUCIONAL'), manifest.generic)

console.log(`TALLERES_ARTWORK_CONTRACT_OK keys=${Object.keys(manifest.cells).length - 1} sprite=${manifest.sha256}`)
