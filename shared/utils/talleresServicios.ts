export type TallerServicioSeed = {
  clave: string
  nombre: string
  imagen: string
  orden: number
}

const publicImage = (clave: string) => `/talleres-servicios/${clave}.svg`

const FINAL_TALLER_NAMES = [
  'FUTBOL',
  'TAE KWON DO',
  'BE AN ARTIST',
  'JAZZ',
  'BABY BALLET',
  'BALLET',
  'DANZA ARABE',
  'GIMNASIA',
  'JAZZ KIDS',
  'JAZZ REPRESENTATIVO',
  'ENSAMBLE MUSICAL',
  'TENIS',
  'BASQUETBOL',
  'TOCHITO BANDERA',
  'TECLADO',
  'TEATRO MUSICAL',
  'AJEDREZ',
  'VOLEIBOL',
  'FOLKLORE',
  'MANOS CREATIVAS',
  'GIMNASIA RITMICA',
  'HUSKY BAND',
] as const

const tallerImageOverrides: Record<string, string> = {
  BABY_BALLET: publicImage('BALLET'),
  JAZZ_KIDS: publicImage('JAZZ'),
  JAZZ_REPRESENTATIVO: publicImage('JAZZ_REPRESENTATIVO_4_DIAS'),
  TENIS: publicImage('TENNIS'),
  TOCHITO_BANDERA: publicImage('TOCHO_BANDERA'),
  GIMNASIA_RITMICA: publicImage('GIMNASIA'),
  FOLKLORE: publicImage('default'),
  MANOS_CREATIVAS: publicImage('default'),
}

export const normalizeServicioClave = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

export const normalizeServicioNombre = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()

export const FINAL_TALLERES: TallerServicioSeed[] = FINAL_TALLER_NAMES.map((nombre, index) => {
  const clave = normalizeServicioClave(nombre)
  return {
    clave,
    nombre,
    imagen: tallerImageOverrides[clave] || publicImage(clave),
    orden: (index + 1) * 10,
  }
})

export const FINAL_TALLER_KEYS = new Set(FINAL_TALLERES.map((item) => item.clave))

const LEGACY_TALLER_ALIASES: Record<string, string> = {
  TENNIS: 'TENIS',
  TOCHO_BANDERA: 'TOCHITO_BANDERA',
  AJEDREZ_4_DIAS: 'AJEDREZ',
  BE_AN_ARTIST_4_DIAS: 'BE_AN_ARTIST',
  JAZZ_REPRESENTATIVO_4_DIAS: 'JAZZ_REPRESENTATIVO',
}

export const KNOWN_TALLER_CATALOG_KEYS = new Set([
  ...FINAL_TALLERES.map((item) => item.clave),
  'TENNIS',
  'TOCHO_BANDERA',
  'DISENO_GRAFICO',
  'ROBOTICA',
  'AJEDREZ_4_DIAS',
  'BE_AN_ARTIST_4_DIAS',
  'JAZZ_REPRESENTATIVO_4_DIAS',
  'INGLES',
  'FRANCES',
  'CATECISMO',
])

export const isKnownTallerCatalogKey = (value: unknown) => KNOWN_TALLER_CATALOG_KEYS.has(normalizeServicioClave(value))

export const canonicalTallerKey = (value: unknown) => {
  const key = normalizeServicioClave(value)
  return LEGACY_TALLER_ALIASES[key] || key
}

export const finalTallerSeed = (value: unknown) => {
  const key = canonicalTallerKey(value)
  return FINAL_TALLERES.find((item) => item.clave === key) || null
}

export const isFinalTaller = (value: unknown) => Boolean(finalTallerSeed(value))

export const DEFAULT_SERVICIOS: TallerServicioSeed[] = [
  { clave: 'DESAYUNO', nombre: 'DESAYUNO', imagen: publicImage('DESAYUNO'), orden: 10 },
  { clave: 'COMIDA', nombre: 'COMIDA', imagen: publicImage('COMIDA'), orden: 20 },
  { clave: 'CENA', nombre: 'CENA', imagen: publicImage('CENA'), orden: 30 },
  { clave: 'BIBERON', nombre: 'BIBERÓN', imagen: publicImage('BIBERON'), orden: 40 },
  { clave: 'PAPILLA', nombre: 'PAPILLA', imagen: publicImage('PAPILLA'), orden: 50 },
  { clave: 'TE_0_5H', nombre: 'TE 0.5H', imagen: publicImage('TE_0_5H'), orden: 210 },
  { clave: 'TE_1H', nombre: 'TE 1H', imagen: publicImage('TE_1H'), orden: 220 },
  { clave: 'TE_1_5H', nombre: 'TE 1.5H', imagen: publicImage('TE_1_5H'), orden: 230 },
  { clave: 'TE_2H', nombre: 'TE 2H', imagen: publicImage('TE_2H'), orden: 240 },
  { clave: 'TE_2_5H', nombre: 'TE 2.5H', imagen: publicImage('TE_2_5H'), orden: 250 },
  { clave: 'TE_3H', nombre: 'TE 3H', imagen: publicImage('TE_3H'), orden: 260 },
  { clave: 'TE_3_5H', nombre: 'TE 3.5H', imagen: publicImage('TE_3_5H'), orden: 270 },
  { clave: 'TE_4H', nombre: 'TE 4H', imagen: publicImage('TE_4H'), orden: 280 },
  { clave: 'CLUB_DE_TAREAS', nombre: 'CLUB DE TAREAS', imagen: publicImage('CLUB_DE_TAREAS'), orden: 290 },
  { clave: 'TRANSPORTE_REDONDO_R1', nombre: 'TRANSPORTE REDONDO R1', imagen: publicImage('TRANSPORTE_REDONDO_R1'), orden: 360 },
  { clave: 'TRANSPORTE_REDONDO_R2', nombre: 'TRANSPORTE REDONDO R2', imagen: publicImage('TRANSPORTE_REDONDO_R2'), orden: 370 },
  { clave: 'TRANSPORTE_SENCILLO_R1', nombre: 'TRANSPORTE SENCILLO R1', imagen: publicImage('TRANSPORTE_SENCILLO_R1'), orden: 380 },
  { clave: 'TRANSPORTE_SENCILLO_R2', nombre: 'TRANSPORTE SENCILLO R2', imagen: publicImage('TRANSPORTE_SENCILLO_R2'), orden: 390 },
  { clave: 'TRANSPORTE_SENCILLO_R3', nombre: 'TRANSPORTE SENCILLO R3', imagen: publicImage('TRANSPORTE_SENCILLO_R3'), orden: 400 },
]

export const DEFAULT_TALLERES_SERVICIOS: TallerServicioSeed[] = [
  ...DEFAULT_SERVICIOS,
  ...FINAL_TALLERES.map((item) => ({ ...item, orden: 500 + item.orden })),
]

export const DEFAULT_TALLER_SERVICIO_IMAGE = '/talleres-servicios/default.svg'



export const parseServiciosCsv = (value: unknown) => {
  const seen = new Set<string>()
  return String(value || '')
    .split(',')
    .map((item) => finalTallerSeed(item)?.nombre || normalizeServicioNombre(item))
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeServicioClave(item)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export const serializeServiciosCsv = (servicios: unknown[]) => {
  const seen = new Set<string>()
  return servicios
    .map((item) => finalTallerSeed(item)?.nombre || normalizeServicioNombre(item))
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeServicioClave(item)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(', ')
}

export const addServicioToCsv = (csv: unknown, servicio: unknown) => {
  const current = parseServiciosCsv(csv)
  const nextServicio = finalTallerSeed(servicio)?.nombre || normalizeServicioNombre(servicio)
  const key = canonicalTallerKey(nextServicio)
  if (!key) return { value: serializeServiciosCsv(current), changed: false, servicios: current }
  const exists = current.some((item) => canonicalTallerKey(item) === key)
  const servicios = exists ? current : [...current, nextServicio]
  return { value: serializeServiciosCsv(servicios), changed: !exists, servicios }
}

export const removeServicioFromCsv = (csv: unknown, servicio: unknown) => {
  const current = parseServiciosCsv(csv)
  const key = canonicalTallerKey(servicio)
  const servicios = current.filter((item) => canonicalTallerKey(item) !== key)
  return { value: serializeServiciosCsv(servicios), changed: servicios.length !== current.length, servicios }
}

export const serviceSeedByKey = (key: unknown) => {
  const normalized = normalizeServicioClave(key)
  return DEFAULT_TALLERES_SERVICIOS.find((item) => item.clave === normalized) || finalTallerSeed(normalized) || null
}

export const serviceSeedByName = (name: unknown) => {
  const normalized = normalizeServicioClave(name)
  return DEFAULT_TALLERES_SERVICIOS.find((item) => item.clave === normalized) || finalTallerSeed(normalized) || null
}
