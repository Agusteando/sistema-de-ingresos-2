import { randomInt, randomUUID } from 'node:crypto'
import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { institutionFlagForPlantel } from '../../../shared/utils/institution'
import { loadStudentDebts } from '../students/[matricula]/debts.get'
import { notifyDocumentAmountCorrection } from '../../utils/telegram-document-audit'

type Snapshot = { subtotal: number; pagos: number; depurado: number; saldo: number }
type Pending = {
  code: string; attempts: number; expiresAt: number; actor: string; agent: string
  matricula: string; documento: number; mes: string; ciclo: string; motivo: string
  snapshot: Snapshot; mesLabel: string; concepto: string; conceptoNombre: string
  recargo: boolean; userName: string; nombre: string; plantel: string; instituto: number
}
const pending = new Map<string, Pending>()
const cents = (n: unknown) => Math.round(Number(n || 0) * 100)
const money = (n: number) => Number((n / 100).toFixed(2))
const TTL = 10 * 60 * 1000
const currentTarget = async (event: any, matricula: string, ciclo: string, documento: number, mes: string) => {
  // Exact same balance calculation as the live account: periods, differences, recargos, scholarships.
  const rows = await loadStudentDebts(event, { matricula, ciclo })
  const debt = rows.find((d: any) => Number(d.documento) === documento && String(d.mes) === mes)
  if (!debt || debt.montoFinalPendiente) throw createError({ statusCode: 409, message: 'El cargo no tiene importe final confirmado.' })
  const snapshot: Snapshot = {
    subtotal: cents(debt.subtotal), pagos: cents(debt.pagos),
    depurado: cents(debt.pagosDepurados), saldo: cents(debt.saldo),
  }
  if (snapshot.pagos <= 0 || snapshot.saldo <= 0 || snapshot.subtotal <= 0) {
    throw createError({ statusCode: 409, message: 'Solo se depuran saldos pendientes con pagos parciales.' })
  }
  if (snapshot.pagos + snapshot.depurado + snapshot.saldo !== snapshot.subtotal) {
    throw createError({ statusCode: 409, message: 'El saldo no coincide con los pagos. Actualiza el estado de cuenta.' })
  }
  return { debt, snapshot }
}
export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  for (const [id, item] of pending) if (item.expiresAt <= Date.now()) pending.delete(id)
  const user = event.context.user
  const actor = String(user?.email || '').trim().toLowerCase()
  if (!user?.hasFinancialAccess || !actor) throw createError({ statusCode: 403, message: 'Solo administradores con acceso financiero pueden depurar saldos.' })
  const body = await readBody(event)
  const action = String(body?.action || '').trim().toLowerCase()
  const agent = String(event.context.dbBridgeAgentId || '').trim().toUpperCase()
  const trace = String(event.context.auroraRequestId || '')

  if (action === 'request') {
    const matricula = String(body?.matricula || '').trim()
    const documento = Number(body?.documento)
    const rawMes = String(body?.mes || '').trim().toLowerCase()
    const mes = rawMes === 'ev' ? 'ev' : String(Number(rawMes))
    const ciclo = normalizeCicloKey(body?.ciclo)
    const motivo = String(body?.motivo || '').trim()
    if (!matricula || !ciclo || !Number.isSafeInteger(documento) || documento <= 0
      || (rawMes !== 'ev' && (!/^(?:[1-9]|1[0-2])$/.test(rawMes) || mes !== rawMes))
      || motivo.length < 8 || motivo.length > 400) {
      throw createError({ statusCode: 400, message: 'Documento, mes y motivo de 8 a 400 caracteres requeridos.' })
    }
    const [{ debt, snapshot }, [document], [student]] = await Promise.all([
      currentTarget(event, matricula, ciclo, documento, mes),
      query<any[]>(`SELECT documento, ciclo, estatus FROM documentos WHERE documento = ? AND matricula = ? LIMIT 1`, [documento, matricula]),
      query<any[]>(`SELECT nombreCompleto, plantel FROM base WHERE matricula = ? LIMIT 1`, [matricula]),
    ])
    if (!document || normalizeCicloKey(document.ciclo) !== ciclo || String(document.estatus || '').trim().toLowerCase() !== 'activo') {
      throw createError({ statusCode: 409, message: 'El documento ya no está vigente en este ciclo.' })
    }
    const plantel = String(student?.plantel || user.active_plantel || '').trim().toUpperCase()
    const userName = String(user.name || actor).slice(0, 255)
    const code = String(randomInt(10000, 100000))
    const id = randomUUID()
    for (const [oldId, previous] of pending) {
      if (previous.actor === actor && previous.documento === documento && previous.mes === mes) pending.delete(oldId)
    }
    const info: Pending = {
      code, attempts: 0, expiresAt: Date.now() + TTL, actor, agent,
      matricula, documento, mes, ciclo, motivo, snapshot,
      mesLabel: String(debt.mesLabel || mes),
      concepto: String(debt.conceptoId || debt.concepto || ''),
      conceptoNombre: String(debt.conceptoNombre || ''),
      recargo: Boolean(debt.hasRecargo), userName,
      nombre: String(student?.nombreCompleto || matricula),
      plantel, instituto: institutionFlagForPlantel(plantel),
    }
    const notice = await notifyDocumentAmountCorrection(
      `*Autorización de depuración* · ${userName}\nAlumno: ${info.nombre} (${matricula}) · ${plantel}\nDocumento #${documento} · ${info.conceptoNombre} · ${info.mesLabel}\nPagado: $${money(snapshot.pagos).toFixed(2)} · Por depurar: $${money(snapshot.saldo).toFixed(2)}\nMotivo: ${motivo}\nCódigo: *${code}* (10 min)`
    )
    if (!notice.delivered) {
      console.error('[Depuracion] Code notification failed', { documento, mes, actor, trace, notice })
      throw createError({ statusCode: 502, message: 'No se pudo enviar el código por Telegram.' })
    }
    pending.set(id, info)
    console.info('[Depuracion] Code requested', { documento, mes, matricula, actor, trace })
    return { success: true, status: 'code_sent', requestId: id, expiresInSeconds: 600, saldo: money(snapshot.saldo) }
  }

  if (action === 'confirm') {
    const id = String(body?.requestId || '').trim()
    const info = pending.get(id)
    if (!info || info.expiresAt <= Date.now()) {
      pending.delete(id)
      throw createError({ statusCode: 409, message: 'Autorización expirada. Solicita otro código.' })
    }
    if (info.actor !== actor || info.agent !== agent) {
      throw createError({ statusCode: 403, message: 'Esta autorización pertenece a otro operador o plantel.' })
    }
    const code = String(body?.code || '').trim()
    info.attempts += 1
    if (!/^\d{5}$/.test(code) || code !== info.code) {
      if (info.attempts >= 3) pending.delete(id)
      throw createError({ statusCode: 400, message: info.attempts >= 3 ? 'Código bloqueado. Solicita uno nuevo.' : 'Código incorrecto.' })
    }
    // Single-use authorization, including when the DB reports an ambiguous commit.
    pending.delete(id)
    const { snapshot } = await currentTarget(event, info.matricula, info.ciclo, info.documento, info.mes)
    if (Object.keys(snapshot).some(k => snapshot[k as keyof Snapshot] !== info.snapshot[k as keyof Snapshot])) {
      throw createError({ statusCode: 409, message: 'El saldo cambió. Actualiza la cuenta y solicita un nuevo código.' })
    }
    const columns = await query<any[]>(`SHOW COLUMNS FROM referenciasdepago LIKE 'depurado_motivo'`)
    if (!columns.length) throw createError({ statusCode: 503, message: 'No está disponible la auditoría de depuraciones. No se modificó el saldo.' })
    const [document] = await query<any[]>(`
      SELECT documento, matricula, ciclo, montoFinal, meses, plazo, estatus
      FROM documentos WHERE documento = ? AND matricula = ? LIMIT 1
    `, [info.documento, info.matricula])
    if (!document || normalizeCicloKey(document.ciclo) !== info.ciclo || String(document.estatus || '').trim().toLowerCase() !== 'activo') {
      throw createError({ statusCode: 409, message: 'El documento dejó de estar vigente.' })
    }
    const settled = money(snapshot.saldo)
    const now = new Date()
    const fields: Record<string, any> = {
      matricula: info.matricula, documento: info.documento, mes: info.mes,
      mesReal: info.mesLabel, nombreCompleto: info.nombre, concepto: info.concepto,
      conceptoNombre: info.conceptoNombre, monto: settled, montoLetra: numeroALetras(settled),
      importeTotal: money(snapshot.subtotal), saldoAntes: settled, saldoDespues: 0,
      pagos: money(snapshot.pagos + snapshot.depurado), pagosDespues: money(snapshot.subtotal),
      recargo: info.recargo ? 1 : 0, usuario: info.userName, usuario_email: actor,
      formaDePago: 'Depuración', plantel: info.plantel, instituto: info.instituto,
      ciclo: info.ciclo, estatus: 'Vigente', depurado: 1, depurado_por: info.userName,
      depurado_fecha: now, depurado_motivo: info.motivo, fecha: now, fecha_original: now,
      fecha_modificada_at: null, fecha_modificada_por: null,
    }
    const names = Object.keys(fields)
    // Use database time for financial records; bridge JSON dates can shift zones.
    const serverTimeFields = new Set(['depurado_fecha', 'fecha', 'fecha_original'])
    const sqlValues = names.map(name => serverTimeFields.has(name) ? 'NOW()' : '?').join(', ')
    const sqlParams = names.filter(name => !serverTimeFields.has(name)).map(name => fields[name])
    const statements: SqlStatement[] = [
      { sql: 'SELECT documento FROM documentos WHERE documento = ? AND matricula = ? FOR UPDATE', params: [info.documento, info.matricula] },
      { sql: `INSERT INTO referenciasdepago (${names.join(', ')})
          SELECT ${sqlValues} FROM documentos d
          WHERE d.documento = ? AND d.matricula = ?
            AND LOWER(TRIM(CAST(d.estatus AS CHAR))) = 'activo'
            AND d.montoFinal <=> ? AND d.plazo <=> ? AND d.meses <=> ?
            AND (SELECT ROUND(COALESCE(SUM(r.monto), 0), 2) FROM referenciasdepago r
              WHERE r.documento = d.documento
                AND (CAST(r.mes AS CHAR) = ? OR (? = 'ev' AND CAST(r.mes AS CHAR) = '1'))
                AND LOWER(TRIM(CAST(r.estatus AS CHAR))) = 'vigente') = ?`,
        params: [...sqlParams, info.documento, info.matricula,
          document.montoFinal, document.plazo, document.meses,
          info.mes, info.mes, money(snapshot.pagos + snapshot.depurado)] },
      { sql: 'SELECT ROW_COUNT() AS inserted, LAST_INSERT_ID() AS folio' },
    ]
    const results = await executeStatementTransaction<any>(statements)
    const outcome = Array.isArray(results[2]) ? results[2][0] : results[2]
    if (Number(outcome?.inserted || 0) !== 1 || Number(outcome?.folio || 0) <= 0) {
      console.warn('[Depuracion] Write conflict', { documento: info.documento, mes: info.mes, trace })
      throw createError({ statusCode: 409, message: 'Cambió el documento o sus pagos. Actualiza el estado de cuenta.' })
    }
    const folio = Number(outcome.folio)
    console.info('[Depuracion] Committed', { folio, documento: info.documento, mes: info.mes, matricula: info.matricula, actor, monto: settled, trace })
    const notification = await notifyDocumentAmountCorrection(
      `*Depuración aplicada* · ${info.userName}\nAlumno: ${info.nombre} (${info.matricula}) · ${info.plantel}\nDocumento #${info.documento} · ${info.conceptoNombre} · ${info.mesLabel}\nPagado: $${money(snapshot.pagos).toFixed(2)} · Depurado: $${settled.toFixed(2)}\nMotivo: ${info.motivo}\nFolio: ${folio}${trace ? ` · Ref: ${trace}` : ''}`
    )
    if (!notification.delivered) console.error('[Depuracion] Telegram audit failed', { folio, trace, notification })
    return { success: true, status: 'depurado', folio, monto: settled, notification }
  }
  throw createError({ statusCode: 400, message: 'Acción de depuración inválida.' })
}))
