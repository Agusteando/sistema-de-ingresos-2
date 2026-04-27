import { randomInt, randomUUID } from 'node:crypto'
import { query } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

type PendingDepuracion = {
  code: string
  expiresAt: number
  matricula: string
  documento: number
  mes: string
  mesLabel: string
  ciclo: string
  conceptoNombre: string
  monto: number
  subtotal: number
  resueltoAntes: number
  recargo: boolean
  motivo: string
  userName: string
  nombreCompleto: string
  plantel: string
  instituto: number
}

const CODE_TTL_MS = 10 * 60 * 1000
const TGBOT_URL = 'https://tgbot.casitaapps.com/sendMessages'
const TGBOT_CHAT_IDS = ['-4885991203']
const pendingDepuraciones = new Map<string, PendingDepuracion>()

const toMoney = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0
}

const cleanExpiredRequests = () => {
  const now = Date.now()

  for (const [requestId, request] of pendingDepuraciones.entries()) {
    if (request.expiresAt <= now) pendingDepuraciones.delete(requestId)
  }
}

const sendTgBotMessage = async (message: string) => {
  const response = await fetch(TGBOT_URL, {
    method: 'POST',
    body: JSON.stringify({ chatId: TGBOT_CHAT_IDS, message }),
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`TGBot respondió con estado ${response.status}`)
  }
}

export default defineEventHandler(async (event) => {
  cleanExpiredRequests()

  const body = await readBody(event)
  const user = event.context.user
  const action = String(body.action || '').toLowerCase().trim()

  if (action === 'request') {
    const matricula = String(body.matricula || '').trim()
    const documento = Number(body.documento)
    const mes = String(body.mes || '').trim()
    const ciclo = normalizeCicloKey(body.ciclo || '2025')
    const conceptoNombre = String(body.conceptoNombre || 'Concepto').trim()
    const mesLabel = String(body.mesLabel || mes).trim()
    const monto = toMoney(body.saldo)
    const subtotal = toMoney(body.subtotal)
    const resueltoAntes = toMoney(body.pagos)
    const pagosRegistrados = toMoney(body.pagosRegistrados ?? body.pagos)
    const recargo = Boolean(body.hasRecargo)
    const motivo = String(body.motivo || '').trim()

    if (!matricula || !documento || !mes) {
      throw createError({ statusCode: 400, message: 'Datos del concepto requeridos.' })
    }

    if (monto <= 0 || subtotal <= 0) {
      throw createError({ statusCode: 400, message: 'La depuración requiere saldo pendiente.' })
    }

    if (pagosRegistrados <= 0) {
      throw createError({
        statusCode: 400,
        message: 'La depuración solo completa conceptos con avance de pago previo.'
      })
    }

    if (!motivo) {
      throw createError({ statusCode: 400, message: 'Motivo de depuración requerido.' })
    }

    const [studentRef] = await query<any[]>(
      `SELECT nombreCompleto, plantel FROM base WHERE matricula = ? LIMIT 1`,
      [matricula]
    )

    if (!studentRef) {
      throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
    }

    const [documentRef] = await query<any[]>(
      `
        SELECT documento
        FROM documentos
        WHERE documento = ? AND matricula = ? AND ciclo = ? AND estatus = 'Activo'
        LIMIT 1
      `,
      [documento, matricula, ciclo]
    )

    if (!documentRef) {
      throw createError({ statusCode: 404, message: 'Concepto no encontrado en este ciclo.' })
    }

    const code = String(randomInt(10000, 100000))
    const requestId = randomUUID()
    const userName = user?.name || 'Operador'
    const plantel = studentRef.plantel || 'PT'

    pendingDepuraciones.set(requestId, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      matricula,
      documento,
      mes,
      mesLabel,
      ciclo,
      conceptoNombre,
      monto,
      subtotal,
      resueltoAntes,
      recargo,
      motivo,
      userName,
      nombreCompleto: studentRef.nombreCompleto,
      plantel,
      instituto: (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0
    })

    try {
      await sendTgBotMessage(
        `*${userName}* solicita depurar el saldo restante de _${conceptoNombre}_ (${mesLabel}) ` +
        `por _$${monto.toFixed(2)}_ para *${studentRef.nombreCompleto}* (${matricula}).\n` +
        `Motivo: _${motivo}_\nCódigo de depuración: *${code}*`
      )
    } catch (error) {
      pendingDepuraciones.delete(requestId)
      throw createError({ statusCode: 502, message: 'No se pudo enviar el código por TGBot.' })
    }

    return { success: true, status: 'code_sent', requestId, expiresInSeconds: CODE_TTL_MS / 1000 }
  }

  if (action === 'confirm') {
    const requestId = String(body.requestId || '').trim()
    const code = String(body.code || '').trim()

    if (!requestId || !/^\d{5}$/.test(code)) {
      throw createError({ statusCode: 400, message: 'Código de depuración inválido.' })
    }

    const pending = pendingDepuraciones.get(requestId)

    if (!pending) {
      throw createError({ statusCode: 404, message: 'Solicitud de depuración expirada o inexistente.' })
    }

    if (pending.expiresAt <= Date.now()) {
      pendingDepuraciones.delete(requestId)
      throw createError({ statusCode: 400, message: 'El código de depuración expiró.' })
    }

    if (pending.code !== code) {
      throw createError({ statusCode: 400, message: 'Código de depuración incorrecto.' })
    }

    const [current] = await query<any[]>(
      `
        SELECT COALESCE(SUM(monto), 0) AS total
        FROM referenciasdepago
        WHERE matricula = ?
          AND ciclo = ?
          AND documento = ?
          AND mes = ?
          AND estatus = 'Vigente'
      `,
      [pending.matricula, pending.ciclo, pending.documento, pending.mes]
    )

    const currentResolved = toMoney(current?.total ?? pending.resueltoAntes)
    const currentSaldo = Math.max(0, toMoney(pending.subtotal - currentResolved))
    const montoDecimal = Math.min(pending.monto, currentSaldo)

    if (montoDecimal <= 0) {
      pendingDepuraciones.delete(requestId)
      throw createError({ statusCode: 400, message: 'El concepto ya no tiene saldo pendiente.' })
    }

    const result = await query<any>(
      `
        INSERT INTO referenciasdepago (
          matricula,
          documento,
          mes,
          mesReal,
          nombreCompleto,
          concepto,
          conceptoNombre,
          monto,
          montoLetra,
          importeTotal,
          saldoAntes,
          saldoDespues,
          pagos,
          pagosDespues,
          recargo,
          usuario,
          formaDePago,
          plantel,
          instituto,
          ciclo,
          estatus,
          depurado,
          depurado_por,
          depurado_fecha
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        pending.matricula,
        pending.documento,
        pending.mes,
        pending.mesLabel,
        pending.nombreCompleto,
        String(pending.documento),
        pending.conceptoNombre,
        montoDecimal,
        numeroALetras(montoDecimal),
        pending.subtotal,
        currentSaldo,
        0,
        currentResolved,
        currentResolved + montoDecimal,
        pending.recargo ? 1 : 0,
        pending.userName,
        'Depuración',
        pending.plantel,
        pending.instituto,
        pending.ciclo,
        'Vigente',
        1,
        pending.userName,
        new Date()
      ]
    )

    pendingDepuraciones.delete(requestId)

    sendTgBotMessage(
      `La depuración solicitada por *${pending.userName}* con código *${pending.code}* ` +
      `fue aplicada por _$${montoDecimal.toFixed(2)}_ en _${pending.conceptoNombre}_ (${pending.mesLabel}).`
    ).catch((error) => {
      console.warn('[Depuracion] No se pudo notificar confirmación por TGBot:', error)
    })

    return { success: true, status: 'depurado', folio: Number(result.insertId || 0), monto: montoDecimal }
  }

  throw createError({ statusCode: 400, message: 'Acción de depuración inválida.' })
})
