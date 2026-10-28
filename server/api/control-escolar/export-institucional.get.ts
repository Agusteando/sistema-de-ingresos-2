import { getTrustedAuthUser } from '../../utils/auth-session'
import { runControlEscolar, fetchControlEscolarExportRows } from '../../utils/control-escolar'
import { attachSectionLabelsToRows } from '../../utils/student-sections'
import { createXlsxWorkbook } from '../../utils/xlsx'
import { CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELD_KEYS } from '../../../shared/constants/controlEscolarReport'
import { normalizeCicloKey, formatCicloLabel } from '../../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../../utils/constants'
import { buildConceptosConfigPayload, readCentralConceptosConfig } from '../../utils/conceptos-config'
import { parseEnrollmentConceptsForScope, parseEnrollmentConceptsForPlantelHistory } from '../../../shared/utils/studentPresentation'
import { createInstitutionalControlEscolarSheets } from '../../utils/control-escolar-institutional-sheets.mjs'

const STATUS_LABELS: Record<string, string> = {
  inscritos: 'Inscritos', all: 'Toda la población', internos: 'Internos',
  externos: 'Externos', no_inscritos: 'No inscritos', bajas: 'Bajas',
}

export default defineEventHandler(async (event) => {
  // A signed session is authoritative. Neither the selected plantel nor a
  // client-controlled cookie can grant institutional access.
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) throw createError({ statusCode: 403, message: 'Solo superadmin puede exportar todos los planteles.' })

  const query = getQuery(event)
  const status = String(Array.isArray(query.status) ? query.status[0] : query.status || 'inscritos').trim().toLowerCase()
  if (!Object.hasOwn(STATUS_LABELS, status)) throw createError({ statusCode: 400, message: 'Estado de inscripción no válido.' })

  const inputCiclo = String(Array.isArray(query.ciclo) ? query.ciclo[0] : query.ciclo || '').trim()
  if (inputCiclo && !/^\d{4}(?:-\d{4})?$/.test(inputCiclo)) {
    throw createError({ statusCode: 400, message: 'Ciclo escolar no válido.' })
  }
  const ciclo = normalizeCicloKey(inputCiclo)
  const rawFields = Array.isArray(query.fields) ? query.fields[0] : query.fields
  const fields = rawFields === undefined
    ? [...CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, 'plantel']
    : String(rawFields).split(',').map((field) => field.trim()).filter(Boolean)
  if (!fields.length || fields.some((field) => !CONTROL_ESCOLAR_REPORT_FIELD_KEYS.has(field))) {
    throw createError({ statusCode: 400, message: 'Selecciona campos válidos para el reporte.' })
  }
  const selectedFields = Array.from(new Set([...fields, 'plantel']))
  // Use the same enrollment-concept mapping as the per-plantel Control Escolar
  // screen. The central configuration is institutional and read-only; its
  // mappings are resolved separately for each plantel and target ciclo.
  let config: ReturnType<typeof buildConceptosConfigPayload>
  try {
    config = buildConceptosConfigPayload(await readCentralConceptosConfig())
  } catch (error: any) {
    console.error('[Control Escolar Export Institucional] Enrollment configuration unavailable', {
      ciclo, code: error?.code || null, message: String(error?.message || error).slice(0, 240),
    })
    throw createError({
      statusCode: 502,
      message: 'No se pudo consultar la configuración académica institucional. No se generó el reporte.',
      data: { code: 'INSTITUTIONAL_EXPORT_ENROLLMENT_CONFIG_UNAVAILABLE' },
    })
  }
  const scopes: Array<{ plantel: string; rows: any[] }> = []

  // Limit concurrent reads so all planteles can finish within a reasonable
  // response window. runWithBridgeAgentId uses AsyncLocalStorage, keeping
  // every campus query in its own bridge context. Preserve catalog order.
  for (let offset = 0; offset < PLANTELES_LIST.length; offset += 3) {
    const batch = PLANTELES_LIST.slice(offset, offset + 3)
    const loaded = await Promise.all(batch.map(async (plantel) => {
      try {
        const concepts = parseEnrollmentConceptsForScope(config, { ciclo, plantel })
        const tipoConcepts = parseEnrollmentConceptsForPlantelHistory(config, { plantel })
        const filtros = {
          ciclo, status, phase: 'enriched',
          concepts: concepts.join(','),
          tipoConcepts: (tipoConcepts.length ? tipoConcepts : concepts).join(','),
        }
        const rows = await runControlEscolar(event, plantel, async () => {
          const sourceRows = await fetchControlEscolarExportRows(plantel, filtros)
          return await attachSectionLabelsToRows(sourceRows, { plantel })
        })
        if (!Array.isArray(rows)) throw new Error('Respuesta inválida o incompleta del plantel ' + plantel)
        return { plantel, rows }
      } catch (error: any) {
        console.error('[Control Escolar Export Institucional] Plantel unavailable', {
          plantel, ciclo, code: error?.data?.code || error?.code || null,
          message: String(error?.message || error).slice(0, 240),
        })
        throw createError({
          statusCode: 502,
          message: 'No se pudo completar la lectura de ' + plantel + '. No se generó un reporte parcial.',
          data: { code: 'INSTITUTIONAL_EXPORT_PLANTEL_UNAVAILABLE', plantel },
        })
      }
    }))
    scopes.push(...loaded)
  }

  const cicloLabel = formatCicloLabel(ciclo)
  const generatedAt = new Date()
  const sheets = createInstitutionalControlEscolarSheets({
    scopes, fields: CONTROL_ESCOLAR_REPORT_FIELDS, selectedFields, cicloLabel,
    statusLabel: STATUS_LABELS[status],
    generatedLabel: generatedAt.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
  })
  const workbook = createXlsxWorkbook(sheets)
  const filename = 'control-escolar-institucional-' + cicloLabel + '-' + generatedAt.toISOString().slice(0, 10) + '.xlsx'
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="' + filename + '"')
  setResponseHeader(event, 'Content-Length', workbook.length)
  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Vary', 'Cookie')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return workbook
})
