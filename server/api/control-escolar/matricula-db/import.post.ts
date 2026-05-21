import {
  CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS,
  CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS,
  importControlEscolarMatriculaUpdates,
  resolveControlEscolarAuth,
  runControlEscolar
} from '../../../utils/control-escolar'

const normalizeHeader = (value: unknown) => String(value || '')
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '')

const headerAliases = new Map<string, string>()
CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS.forEach((field) => {
  headerAliases.set(normalizeHeader(field), field)
  headerAliases.set(normalizeHeader(CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS[field]), field)
})
headerAliases.set('matricula', 'matricula')
headerAliases.set('nombre', 'nombres')
headerAliases.set('nombres', 'nombres')
headerAliases.set('apaterno', 'apellidoPaterno')
headerAliases.set('amaterno', 'apellidoMaterno')
headerAliases.set('telefono', 'telefonoPadre')
headerAliases.set('email', 'emailPadre')
headerAliases.set('correo', 'emailPadre')
headerAliases.set('tutor', 'nombrePadre')

const parseCsv = (text: string) => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index++
      row.push(cell)
      if (row.some((value) => String(value || '').trim())) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell)
  if (row.some((value) => String(value || '').trim())) rows.push(row)
  return rows
}

const rowsFromCsv = (text: string) => {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const headerIndex = rows.findIndex((row) => row.some((cell) => headerAliases.get(normalizeHeader(cell)) === 'matricula'))
  if (headerIndex < 0) {
    throw createError({ statusCode: 400, message: 'El archivo no contiene una columna de matrícula.' })
  }

  const headers = rows[headerIndex].map((cell) => headerAliases.get(normalizeHeader(cell)) || '')
  return rows.slice(headerIndex + 1).map((values) => {
    const record: Record<string, string> = {}
    headers.forEach((field, index) => {
      if (!field) return
      record[field] = String(values[index] ?? '').trim()
    })
    return record
  }).filter((record) => Object.values(record).some(Boolean))
}

const readCsvUpload = async (event: any) => {
  const parts = await readMultipartFormData(event).catch(() => null)
  const filePart = parts?.find((part: any) => part.filename || part.name === 'file')
  if (filePart?.data) return Buffer.from(filePart.data).toString('utf8')

  const raw = await readRawBody(event, 'utf8')
  if (!raw) throw createError({ statusCode: 400, message: 'Sube un archivo CSV de Control Escolar.' })
  return raw
}

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const csvText = await readCsvUpload(event)
      const rows = rowsFromCsv(csvText)
      if (!rows.length) {
        throw createError({ statusCode: 400, message: 'El archivo no contiene filas para actualizar.' })
      }

      const summary = await importControlEscolarMatriculaUpdates(auth.agentId, rows, auth.user, queryParams)
      return { success: true, agentId: auth.agentId, summary }
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: 502,
        message: error?.message || 'No se pudo importar la actualización masiva de Control Escolar.'
      })
    }
  })
})
