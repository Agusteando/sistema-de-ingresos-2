import { resolveControlEscolarAuth, updateControlEscolarHuskyPass } from '../../../utils/control-escolar'
import { logControlEscolarAuditEvent } from '../../../utils/control-escolar-audit'
import { sendControlEscolarHuskyPassEmail } from '../../../utils/control-escolar-husky-pass-email'

const MAX_BULK_STUDENTS = 50
const CONCURRENCY = 5

const normalizeMatriculas = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim().toUpperCase().slice(0, 64))
    .filter(Boolean),
)).slice(0, MAX_BULK_STUDENTS)

const errorCode = (error: any) => String(
  error?.data?.code || error?.statusMessage || error?.code || '',
).trim().toUpperCase()

const errorMessage = (error: any) => String(
  error?.data?.message || error?.message || 'No se pudo completar la operación.',
).replace(/\s+/g, ' ').trim().slice(0, 300)

const runConcurrent = async <T, R>(items: T[], worker: (item: T) => Promise<R>) => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, query.agentId)
  const body = await readBody(event).catch(() => ({}))
  const action = String(body?.action || '').trim().toLowerCase()
  const matriculas = normalizeMatriculas(body?.matriculas)

  if (!['generate_missing', 'send_existing'].includes(action)) {
    throw createError({ statusCode: 400, message: 'Acción masiva de Husky Pass inválida.' })
  }
  if (!matriculas.length) {
    throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
  }
  if (Array.isArray(body?.matriculas) && body.matriculas.length > MAX_BULK_STUDENTS) {
    throw createError({
      statusCode: 400,
      message: `Procesa máximo ${MAX_BULK_STUDENTS} alumnos por lote.`,
      data: { code: 'HUSKY_PASS_BULK_LIMIT', limit: MAX_BULK_STUDENTS },
    })
  }

  const results = await runConcurrent(matriculas, async (matricula) => {
    try {
      if (action === 'generate_missing') {
        const result = await updateControlEscolarHuskyPass(auth.agentId, matricula, { action: 'generate' })
        return {
          matricula,
          status: result.action === 'existing' ? 'existing' : 'generated',
          student: result.student || null,
        }
      }

      const result = await sendControlEscolarHuskyPassEmail({
        agentId: auth.agentId,
        matricula,
        senderEmail: auth.user.email,
      })
      return {
        matricula,
        status: 'sent',
        sentTo: result.sentTo,
      }
    } catch (error: any) {
      const code = errorCode(error)
      if (action === 'send_existing' && code === 'HUSKY_PASS_MISSING') {
        return { matricula, status: 'missing_pass', message: errorMessage(error) }
      }
      if (action === 'send_existing' && code === 'HUSKY_PASS_EMAIL_MISSING') {
        return { matricula, status: 'missing_email', message: errorMessage(error) }
      }
      return { matricula, status: 'failed', message: errorMessage(error) }
    }
  })

  const counts = results.reduce((summary: Record<string, number>, item: any) => {
    summary[item.status] = (summary[item.status] || 0) + 1
    return summary
  }, {})

  if (action === 'generate_missing') {
    const completed = Number(counts.generated || 0) + Number(counts.existing || 0)
    logControlEscolarAuditEvent({
      eventType: 'student_update',
      plantel: auth.agentId,
      ciclo: String(query.ciclo || query.cicloKey || ''),
      user: auth.user,
      summary: `Generó Husky Pass faltantes para selección de ${matriculas.length} alumnos`,
      progress: {
        percent: matriculas.length ? (completed / matriculas.length) * 100 : 0,
        total: matriculas.length,
        completed,
        pending: Math.max(0, matriculas.length - completed),
      },
      source: { base: 'central', flow: 'husky_pass_bulk_generate_missing' },
      payload: { action, counts },
    }).catch((error: any) => {
      console.warn('[Control Escolar Audit] Husky Pass bulk audit skipped', error?.message || error)
    })
  }

  return {
    success: Number(counts.failed || 0) === 0,
    action,
    total: matriculas.length,
    counts: {
      generated: Number(counts.generated || 0),
      existing: Number(counts.existing || 0),
      sent: Number(counts.sent || 0),
      missingPass: Number(counts.missing_pass || 0),
      missingEmail: Number(counts.missing_email || 0),
      failed: Number(counts.failed || 0),
    },
    results,
  }
})
