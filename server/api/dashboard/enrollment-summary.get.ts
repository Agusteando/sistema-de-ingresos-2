import { getTrustedAuthUser } from '../../utils/auth-session'
import { fetchControlEscolarExportData, runControlEscolar } from '../../utils/control-escolar'
import { buildConceptosConfigPayload, readCentralConceptosConfig } from '../../utils/conceptos-config'
import { loadInstitutionalControlEscolarScopes } from '../../utils/control-escolar-institutional-load.mjs'
import { buildInstitutionalEnrollmentSummary } from '../../utils/dashboard-enrollment-summary.mjs'
import { parseEnrollmentConceptsForScope, parseEnrollmentConceptsForPlantelHistory } from '../../../shared/utils/studentPresentation'
import { formatCicloLabel, normalizeCicloKey } from '../../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../../utils/constants'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) throw createError({ statusCode: 403, message: 'Solo superadmin puede consultar el resumen institucional.' })

  const rawCiclo = getQuery(event).ciclo
  const requestedCiclo = String(Array.isArray(rawCiclo) ? rawCiclo[0] : rawCiclo || '').trim()
  if (requestedCiclo && !/^\d{4}(?:-\d{4})?$/.test(requestedCiclo)) {
    throw createError({ statusCode: 400, message: 'Ciclo escolar no válido.' })
  }
  const ciclo = normalizeCicloKey(requestedCiclo)
  let config: ReturnType<typeof buildConceptosConfigPayload>
  try {
    config = buildConceptosConfigPayload(await readCentralConceptosConfig())
  } catch (error: any) {
    console.error('[Dashboard Enrollment] Institutional enrollment mapping unavailable', {
      ciclo, code: error?.code || null, message: String(error?.message || error).slice(0, 240),
    })
    throw createError({ statusCode: 502,
      message: 'No se pudo consultar la configuración de inscripción. No se calcularon totales.',
      data: { code: 'DASHBOARD_ENROLLMENT_MAPPING_UNAVAILABLE' },
    })
  }

  const scopes = await loadInstitutionalControlEscolarScopes({
    planteles: PLANTELES_LIST,
    read: async (plantel: string) => {
      const concepts = parseEnrollmentConceptsForScope(config, { ciclo, plantel })
      const tipoConcepts = parseEnrollmentConceptsForPlantelHistory(config, { plantel })
      return await runControlEscolar(event, plantel, async () => {
        const loaded = await fetchControlEscolarExportData(plantel, {
          ciclo, status: 'all', phase: 'enriched',
          concepts: concepts.join(','), tipoConcepts: (tipoConcepts.length ? tipoConcepts : concepts).join(','),
        })
        const source = loaded.source || {}
        const backup = source.bridgeFallback === true
        return {
          rows: loaded.rows,
          dataStatus: backup
            ? (String(source.cacheFreshness || '').includes('stale') ? 'backup-stale' : 'backup')
            : 'live',
          snapshotAt: backup ? source.cacheRefreshedAt || null : null,
        }
      })
    },
    onUnavailable: (plantel: string, error: any) => {
      console.warn('[Dashboard Enrollment] Campus unavailable', {
        plantel, ciclo, code: error?.data?.code || error?.code || null,
        message: String(error?.message || error).slice(0, 240),
      })
    },
  })

  const summary = buildInstitutionalEnrollmentSummary({ ciclo, scopes })
  console.info('[Dashboard Enrollment] Scope coverage', {
    ciclo, available: summary.coverage.available, total: summary.coverage.total,
    unavailable: summary.coverage.unavailable, backups: summary.coverage.backups,
    inscritos: summary.total.inscritos,
  })
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'Vary', 'Cookie')
  return { ...summary, cicloLabel: formatCicloLabel(ciclo), generatedAt: new Date().toISOString() }
})
