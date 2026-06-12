export type TallerServicioSeed = {
  clave: string
  nombre: string
  imagen: string
  orden: number
}

const publicImage = (clave: string) => `/talleres-servicios/${clave}.svg`

export const DEFAULT_TALLERES_SERVICIOS: TallerServicioSeed[] = [
  { clave: 'DESAYUNO', nombre: 'DESAYUNO', imagen: publicImage('DESAYUNO'), orden: 10 },
  { clave: 'COMIDA', nombre: 'COMIDA', imagen: publicImage('COMIDA'), orden: 20 },
  { clave: 'CENA', nombre: 'CENA', imagen: publicImage('CENA'), orden: 30 },
  { clave: 'BIBERON', nombre: 'BIBERÓN', imagen: publicImage('BIBERON'), orden: 40 },
  { clave: 'PAPILLA', nombre: 'PAPILLA', imagen: publicImage('PAPILLA'), orden: 50 },
  { clave: 'FUTBOL', nombre: 'FÚTBOL', imagen: publicImage('FUTBOL'), orden: 60 },
  { clave: 'TAE_KWON_DO', nombre: 'TAE KWON DO', imagen: publicImage('TAE_KWON_DO'), orden: 70 },
  { clave: 'BE_AN_ARTIST', nombre: 'BE AN ARTIST', imagen: publicImage('BE_AN_ARTIST'), orden: 80 },
  { clave: 'JAZZ', nombre: 'JAZZ', imagen: publicImage('JAZZ'), orden: 90 },
  { clave: 'BALLET', nombre: 'BALLET', imagen: publicImage('BALLET'), orden: 100 },
  { clave: 'DANZA_ARABE', nombre: 'DANZA ÁRABE', imagen: publicImage('DANZA_ARABE'), orden: 110 },
  { clave: 'ENSAMBLE_MUSICAL', nombre: 'ENSAMBLE MUSICAL', imagen: publicImage('ENSAMBLE_MUSICAL'), orden: 120 },
  { clave: 'TENNIS', nombre: 'TENNIS', imagen: publicImage('TENNIS'), orden: 130 },
  { clave: 'BASQUETBOL', nombre: 'BASQUETBOL', imagen: publicImage('BASQUETBOL'), orden: 140 },
  { clave: 'TOCHO_BANDERA', nombre: 'TOCHO BANDERA', imagen: publicImage('TOCHO_BANDERA'), orden: 150 },
  { clave: 'TECLADO', nombre: 'TECLADO', imagen: publicImage('TECLADO'), orden: 160 },
  { clave: 'TEATRO_MUSICAL', nombre: 'TEATRO MUSICAL', imagen: publicImage('TEATRO_MUSICAL'), orden: 170 },
  { clave: 'AJEDREZ', nombre: 'AJEDREZ', imagen: publicImage('AJEDREZ'), orden: 180 },
  { clave: 'VOLEIBOL', nombre: 'VOLEIBOL', imagen: publicImage('VOLEIBOL'), orden: 190 },
  { clave: 'GIMNASIA', nombre: 'GIMNASIA', imagen: publicImage('GIMNASIA'), orden: 200 },
  { clave: 'TE_0_5H', nombre: 'TE 0.5H', imagen: publicImage('TE_0_5H'), orden: 210 },
  { clave: 'TE_1H', nombre: 'TE 1H', imagen: publicImage('TE_1H'), orden: 220 },
  { clave: 'TE_1_5H', nombre: 'TE 1.5H', imagen: publicImage('TE_1_5H'), orden: 230 },
  { clave: 'TE_2H', nombre: 'TE 2H', imagen: publicImage('TE_2H'), orden: 240 },
  { clave: 'TE_2_5H', nombre: 'TE 2.5H', imagen: publicImage('TE_2_5H'), orden: 250 },
  { clave: 'TE_3H', nombre: 'TE 3H', imagen: publicImage('TE_3H'), orden: 260 },
  { clave: 'TE_3_5H', nombre: 'TE 3.5H', imagen: publicImage('TE_3_5H'), orden: 270 },
  { clave: 'TE_4H', nombre: 'TE 4H', imagen: publicImage('TE_4H'), orden: 280 },
  { clave: 'CLUB_DE_TAREAS', nombre: 'CLUB DE TAREAS', imagen: publicImage('CLUB_DE_TAREAS'), orden: 290 },
  { clave: 'DISENO_GRAFICO', nombre: 'DISEÑO GRÁFICO', imagen: publicImage('DISENO_GRAFICO'), orden: 300 },
  { clave: 'HUSKY_BAND', nombre: 'HUSKY BAND', imagen: publicImage('HUSKY_BAND'), orden: 310 },
  { clave: 'ROBOTICA', nombre: 'ROBÓTICA', imagen: publicImage('ROBOTICA'), orden: 320 },
  { clave: 'AJEDREZ_4_DIAS', nombre: 'AJEDREZ (4 DÍAS)', imagen: publicImage('AJEDREZ_4_DIAS'), orden: 330 },
  { clave: 'BE_AN_ARTIST_4_DIAS', nombre: 'BE AN ARTIST (4 DÍAS)', imagen: publicImage('BE_AN_ARTIST_4_DIAS'), orden: 340 },
  { clave: 'JAZZ_REPRESENTATIVO_4_DIAS', nombre: 'JAZZ REPRESENTATIVO (4 DÍAS)', imagen: publicImage('JAZZ_REPRESENTATIVO_4_DIAS'), orden: 350 },
  { clave: 'TRANSPORTE_REDONDO_R1', nombre: 'TRANSPORTE REDONDO R1', imagen: publicImage('TRANSPORTE_REDONDO_R1'), orden: 360 },
  { clave: 'TRANSPORTE_REDONDO_R2', nombre: 'TRANSPORTE REDONDO R2', imagen: publicImage('TRANSPORTE_REDONDO_R2'), orden: 370 },
  { clave: 'TRANSPORTE_SENCILLO_R1', nombre: 'TRANSPORTE SENCILLO R1', imagen: publicImage('TRANSPORTE_SENCILLO_R1'), orden: 380 },
  { clave: 'TRANSPORTE_SENCILLO_R2', nombre: 'TRANSPORTE SENCILLO R2', imagen: publicImage('TRANSPORTE_SENCILLO_R2'), orden: 390 },
  { clave: 'TRANSPORTE_SENCILLO_R3', nombre: 'TRANSPORTE SENCILLO R3', imagen: publicImage('TRANSPORTE_SENCILLO_R3'), orden: 400 },
  { clave: 'INGLES', nombre: 'INGLÉS', imagen: publicImage('INGLES'), orden: 410 },
  { clave: 'FRANCES', nombre: 'FRANCÉS', imagen: publicImage('FRANCES'), orden: 420 },
  { clave: 'CATECISMO', nombre: 'CATECISMO', imagen: publicImage('CATECISMO'), orden: 430 },
]

export const DEFAULT_TALLER_SERVICIO_IMAGE = '/talleres-servicios/default.svg'

export const normalizeServicioClave = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

export const normalizeServicioNombre = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()

export const parseServiciosCsv = (value: unknown) => {
  const seen = new Set<string>()
  return String(value || '')
    .split(',')
    .map(normalizeServicioNombre)
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
    .map(normalizeServicioNombre)
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
  const nextServicio = normalizeServicioNombre(servicio)
  const key = normalizeServicioClave(nextServicio)
  if (!key) return { value: serializeServiciosCsv(current), changed: false, servicios: current }
  const exists = current.some((item) => normalizeServicioClave(item) === key)
  const servicios = exists ? current : [...current, nextServicio]
  return { value: serializeServiciosCsv(servicios), changed: !exists, servicios }
}

export const removeServicioFromCsv = (csv: unknown, servicio: unknown) => {
  const current = parseServiciosCsv(csv)
  const key = normalizeServicioClave(servicio)
  const servicios = current.filter((item) => normalizeServicioClave(item) !== key)
  return { value: serializeServiciosCsv(servicios), changed: servicios.length !== current.length, servicios }
}

export const serviceSeedByKey = (key: unknown) => {
  const normalized = normalizeServicioClave(key)
  return DEFAULT_TALLERES_SERVICIOS.find((item) => item.clave === normalized) || null
}

export const serviceSeedByName = (name: unknown) => {
  const normalized = normalizeServicioClave(name)
  return DEFAULT_TALLERES_SERVICIOS.find((item) => item.clave === normalized) || null
}
