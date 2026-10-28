import { getTrustedAuthUser } from '../../utils/auth-session'
import { runControlEscolar, fetchControlEscolarExportData } from '../../utils/control-escolar'
import { attachSectionLabelsToRows } from '../../utils/student-sections'
import { createXlsxWorkbook } from '../../utils/xlsx'
import { CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELD_KEYS } from '../../../shared/constants/controlEscolarReport'
import { normalizeCicloKey, formatCicloLabel } from '../../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../../utils/constants'
import { buildConceptosConfigPayload, readCentralConceptosConfig } from '../../utils/conceptos-config'
import { parseEnrollmentConceptsForScope, parseEnrollmentConceptsForPlantelHistory } from '../../../shared/utils/studentPresentation'
import { createInstitutionalControlEscolarSheets } from '../../utils/control-escolar-institutional-sheets.mjs'
import { loadInstitutionalControlEscolarScopes } from '../../utils/control-escolar-institutional-load.mjs'

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
  // The normal Control Escolar reader already attempts a verified snapshot if
  // the campus bridge is offline. If neither source exists, retain a
  // distinguishable unavailable scope rather than aborting other planteles.
  const scopes = await loadInstitutionalControlEscolarScopes({
    planteles: PLANTELES_LIST,
    read: async (plantel: string) => {
      const concepts = parseEnrollmentConceptsForScope(config, { ciclo, plantel })
      const tipoConcepts = parseEnrollmentConceptsForPlantelHistory(config, { plantel })
      const filtros = {
        ciclo, status, phase: 'enriched',
        concepts: concepts.join(','),
        tipoConcepts: (tipoConcepts.length ? tipoConcepts : concepts).join(','),
      }
      return await runControlEscolar(event, plantel, async () => {
        const loaded = await fetchControlEscolarExportData(plantel, filtros)
        const rows = await attachSectionLabelsToRows(loaded.rows, { plantel })
        const source = loaded.source || {}
        const isBackup = source.bridgeFallback === true
        return {
          plantel, rows,
          dataStatus: isBackup
            ? (String(source.cacheFreshness || '').includes('stale') ? 'backup-stale' : 'backup')
            : 'live',
          snapshotAt: isBackup ? (source.cacheRefreshedAt || null) : null,
        }
      })
    },
    onUnavailable: (plantel: string, error: any) => {
      console.warn('[Control Escolar Export Institucional] Plantel unavailable', {
        plantel, ciclo, code: error?.data?.code || error?.code || null,
        message: String(error?.message || error).slice(0, 240),
      })
    },
  })

  const readable = scopes.filter((scope) => Array.isArray(scope.rows))
  const unavailable = scopes.filter((scope) => scope.rows === null).map((scope) => scope.plantel)
  if (!readable.length) {
    throw createError({
      statusCode: 503,
      message: 'No hay datos de planteles disponibles, ni respaldos verificados. Inténtalo cuando alguno esté disponible.',
      data: { code: 'INSTITUTIONAL_EXPORT_NO_CAMPUS_DATA', unavailable },
    })
  }
  console.info('[Control Escolar Export Institucional] Scope coverage', {
    ciclo, status, available: readable.length, unavailable,
    backups: scopes.filter((scope) => String(scope.dataStatus).startsWith('backup')).map((scope) => scope.plantel),
    rows: readable.reduce((sum, scope) => sum + scope.rows.length, 0),
  })

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
  setResponseHeader(event, 'X-Institutional-Export-Partial', unavailable.length ? '1' : '0')
  setResponseHeader(event, 'X-Institutional-Export-Unavailable', unavailable.join(','))
  setResponseHeader(event, 'X-Institutional-Export-Available', String(readable.length))
  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Vary', 'Cookie')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return workbook
})
