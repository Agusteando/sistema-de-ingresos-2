import { automaticSchoolCycleKey, normalizeCicloKey } from '../../shared/utils/ciclo'
import { controlEscolarCentralQuery, withControlEscolarCentralConnection } from './control-escolar-central'
import {
  buildExternalControlEscolarScope,
  ensureControlEscolarExternalViewSchema,
  getExternalStudentPlanteles,
  warmExternalControlEscolarStudentScope
} from './control-escolar-external-view'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

const EXTERNAL_VIEW_TABLE = 'control_external_student_view'
const VIEW_VERSION = 'control-escolar-student-view-v1'
const REFRESH_LOCK_NAME = 'aurora:external-student-snapshot-refresh'

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const refreshMinutes = () => {
  const value = Number(process.env.AURORA_EXTERNAL_SNAPSHOT_REFRESH_MINUTES || 30)
  return Math.max(5, Math.min(180, Number.isFinite(value) ? value : 30))
}

const refreshPauseMs = () => {
  const value = Number(process.env.AURORA_EXTERNAL_SNAPSHOT_SCOPE_PAUSE_MS || 1250)
  return Math.max(250, Math.min(10_000, Number.isFinite(value) ? value : 1250))
}

const latestSnapshotTimes = async (ciclo: string, planteles: string[]): Promise<Map<string, number>> => {
  await ensureControlEscolarExternalViewSchema()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT plantel, scope_key, MAX(generated_at) AS generated_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE ciclo_key = ? AND view_version = ?
     GROUP BY plantel, scope_key`,
    [ciclo, VIEW_VERSION]
  )
  const byScope = new Map<string, number>(
    rows.map((row) => [
      `${normalizeExternalControlEscolarPlantel(row.plantel)}:${clean(row.scope_key, 64)}`,
      row?.generated_at ? new Date(row.generated_at).getTime() : 0
    ])
  )

  return new Map<string, number>(
    planteles.map((plantel): [string, number] => {
      const scope = buildExternalControlEscolarScope({ plantel, ciclo })
      return [plantel, byScope.get(`${plantel}:${scope.descriptor.scopeKey}`) || 0]
    })
  )
}

export const runExternalControlEscolarSnapshotRefreshPass = async (input: {
  ciclo?: string
  force?: boolean
  planteles?: string[]
} = {}) => {
  const ciclo = normalizeCicloKey(input.ciclo || automaticSchoolCycleKey())
  if (!ciclo) return { skipped: true, reason: 'ciclo_unavailable' }

  return await withControlEscolarCentralConnection(async (connection) => {
    const [lockRows]: any = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [REFRESH_LOCK_NAME])
    if (Number(lockRows?.[0]?.acquired || 0) !== 1) {
      return { skipped: true, reason: 'refresh_in_progress', ciclo }
    }

    try {
      const threshold = Date.now() - refreshMinutes() * 60 * 1000
      const requested: string[] = Array.isArray(input.planteles) && input.planteles.length
        ? input.planteles
            .map((plantel) => normalizeExternalControlEscolarPlantel(plantel))
            .filter((plantel): plantel is string => Boolean(plantel))
        : getExternalStudentPlanteles()
      const planteles = Array.from(new Set<string>(requested))
      const latest = await latestSnapshotTimes(ciclo, planteles)
      const due = planteles.filter((plantel) => input.force || (latest.get(plantel) || 0) < threshold)
      const results: any[] = []
      const failures: any[] = []

      for (let index = 0; index < due.length; index += 1) {
        const plantel = due[index]
        try {
          const result = await warmExternalControlEscolarStudentScope({ plantel, ciclo })
          results.push({ plantel, ...result })
        } catch (error: any) {
          failures.push({
            plantel,
            code: clean(error?.data?.code || error?.statusMessage || error?.code || 'SNAPSHOT_REFRESH_FAILED', 120),
            message: clean(error?.message || error?.statusMessage || 'No se pudo refrescar el snapshot.', 500)
          })
        }
        if (index < due.length - 1) await wait(refreshPauseMs())
      }

      return {
        success: failures.length === 0,
        ciclo,
        refreshMinutes: refreshMinutes(),
        dueScopes: due.length,
        refreshedScopes: results.length,
        failedScopes: failures.length,
        results,
        failures
      }
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?) AS released', [REFRESH_LOCK_NAME]).catch(() => null)
    }
  })
}
