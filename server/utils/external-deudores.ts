import { PLANTELES_LIST } from '../../utils/constants'
import { formatCicloLabel } from '../../shared/utils/ciclo'
import {
  checkBridgeAgentAvailability,
  getDbTransport,
  runRawSqlStatement,
  runWithBridgeAgentId
} from './db'
import { getDeudoresGlobal } from './deudores'

const text = (value: unknown) => String(value ?? '').trim()
const upper = (value: unknown) => text(value).toUpperCase()
const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

const parseCiclo = (value: unknown) => {
  const raw = text(value)
  const match = raw.match(/^(20\d{2})(?:-(20\d{2}))?$/)
  if (!match) {
    throw createError({
      statusCode: 400,
      statusMessage: 'CICLO_INVALIDO',
      message: 'El ciclo debe enviarse como 2026 o 2026-2027.',
      data: { code: 'CICLO_INVALIDO' }
    })
  }

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : start + 1
  if (end !== start + 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'CICLO_INVALIDO',
      message: 'El rango del ciclo escolar no es válido.',
      data: { code: 'CICLO_INVALIDO' }
    })
  }

  return String(start)
}

const configuredAgents = () => {
  const configured = text(process.env.DEUDORES_BRIDGE_AGENT_IDS)
    .split(',')
    .map(value => upper(value))
    .filter(Boolean)
  const fallback = configured.length ? configured : PLANTELES_LIST
  return Array.from(new Set(fallback.map(value => upper(value)).filter(Boolean)))
}

const orderAgentsForMatricula = (matricula: string) => {
  const agents = configuredAgents()
  const preferred = agents
    .filter(agent => matricula.startsWith(agent))
    .sort((left, right) => right.length - left.length)
  const rest = agents.filter(agent => !preferred.includes(agent))
  return [...preferred, ...rest]
}

const findStudentInAgent = async (agentId: string, matricula: string) => {
  try {
    return await runWithBridgeAgentId(agentId, async () => {
      const rows = await runRawSqlStatement<any[]>(`
        SELECT matricula, plantel, estatus, nombreCompleto
        FROM base
        WHERE UPPER(TRIM(matricula)) = ?
        LIMIT 1
      `, [matricula])
      return rows[0] || null
    })
  } catch {
    return null
  }
}

const resolveBridgeSource = async (matricula: string) => {
  const agents = orderAgentsForMatricula(matricula)
  const preferred = agents[0]

  if (preferred) {
    const availability = await checkBridgeAgentAvailability(preferred, { timeoutMs: 1200 })
    if (availability.online) {
      const student = await findStudentInAgent(preferred, matricula)
      if (student) return { agentId: preferred, student }
    }
  }

  const remaining = agents.filter(agent => agent !== preferred)
  const availability = await Promise.all(
    remaining.map(async agentId => ({
      agentId,
      availability: await checkBridgeAgentAvailability(agentId, { timeoutMs: 1200 })
    }))
  )
  const onlineAgents = availability
    .filter(item => item.availability.online)
    .map(item => item.agentId)

  if (!onlineAgents.length) {
    throw createError({
      statusCode: 503,
      statusMessage: 'FUENTE_FINANCIERA_NO_DISPONIBLE',
      message: 'No hay una fuente financiera disponible para consultar la matrícula.',
      data: { code: 'FUENTE_FINANCIERA_NO_DISPONIBLE' }
    })
  }

  const matches = await Promise.all(
    onlineAgents.map(async agentId => ({ agentId, student: await findStudentInAgent(agentId, matricula) }))
  )
  const match = matches.find(item => item.student)

  if (!match) {
    throw createError({
      statusCode: 404,
      statusMessage: 'MATRICULA_NO_ENCONTRADA',
      message: 'No se encontró la matrícula solicitada.',
      data: { code: 'MATRICULA_NO_ENCONTRADA', matricula }
    })
  }

  return match as { agentId: string, student: any }
}

const summarizeRows = ({
  matricula,
  ciclo,
  rows,
  student,
  source
}: {
  matricula: string
  ciclo: string
  rows: any[]
  student: any
  source: { type: 'direct' | 'bridge', agentId?: string | null }
}) => {
  const detail = rows.flatMap((row) => {
    const items = Array.isArray(row.desglose) ? row.desglose : []
    return items.map((item: any) => {
      const saldo = money(item.saldo)
      const pendienteConciliacion = money(item.pendienteConciliacion)
      const exigible = Boolean(row.isDeudor) && saldo > 0
      const estatus = saldo <= 0
        ? 'pagado'
        : (pendienteConciliacion > 0
            ? 'pendiente_conciliacion'
            : (row.fechaLimiteEspecialVigente ? 'fecha_especial' : (exigible ? 'vencido' : 'pendiente')))

      return {
        documento: Number(item.documento),
        concepto: text(item.conceptoNombre),
        mes: text(item.mesCargo),
        periodo: text(item.mesLabel),
        monto: money(item.subtotal),
        pagado: money(item.pagado),
        pendienteConciliacion,
        saldo,
        exigible,
        estatus
      }
    })
  })

  const saldoPendiente = money(rows.reduce((sum, row) => sum + Number(row.saldoPendiente || 0), 0))
  const saldoExigible = money(rows.filter(row => Boolean(row.isDeudor)).reduce((sum, row) => sum + Number(row.saldoPendiente || 0), 0))
  const totalCargosVencidos = money(rows.reduce((sum, row) => sum + Number(row.totalCargos || 0), 0))
  const totalPagado = money(rows.reduce((sum, row) => sum + Number(row.totalPagado || 0), 0))
  const pendienteConciliacion = money(rows.reduce((sum, row) => sum + Number(row.totalPendienteConciliacion || 0), 0))
  const esDeudor = saldoExigible > 0
  const tieneExcepcion = rows.some(row => Boolean(row.fechaLimiteEspecialVigente))
  const tieneConciliacionPendiente = rows.some(row => Boolean(row.pagoPendienteConciliacion))

  return {
    ok: true,
    matricula,
    ciclo: {
      clave: ciclo,
      nombre: formatCicloLabel(ciclo)
    },
    alumno: {
      nombre: text(rows[0]?.nombreCompleto || student?.nombreCompleto) || null,
      plantel: text(rows[0]?.plantel || student?.plantel) || null,
      activo: upper(student?.estatus) === 'ACTIVO'
    },
    estatus: esDeudor ? 'deudor' : 'sin_adeudo_exigible',
    esDeudor,
    saldos: {
      pendiente: saldoPendiente,
      exigible: saldoExigible,
      cargosVencidos: totalCargosVencidos,
      pagadoAplicado: totalPagado,
      pendienteConciliacion
    },
    condiciones: {
      pagoPendienteConciliacion: tieneConciliacionPendiente,
      fechaLimiteEspecialVigente: tieneExcepcion
    },
    detalle: detail,
    consultadoEn: new Date().toISOString(),
    fuente: { tipo: source.type }
  }
}

export const readExternalDeudorStatus = async (query: Record<string, any>) => {
  const matricula = upper(query.matricula)
  if (!matricula) {
    throw createError({
      statusCode: 400,
      statusMessage: 'MATRICULA_REQUERIDA',
      message: 'La matrícula es requerida.',
      data: { code: 'MATRICULA_REQUERIDA' }
    })
  }

  const ciclo = parseCiclo(query.ciclo)

  if (getDbTransport() === 'direct') {
    const students = await runRawSqlStatement<any[]>(`
      SELECT matricula, plantel, estatus, nombreCompleto
      FROM base
      WHERE UPPER(TRIM(matricula)) = ?
      LIMIT 1
    `, [matricula])
    const student = students[0]
    if (!student) {
      throw createError({
        statusCode: 404,
        statusMessage: 'MATRICULA_NO_ENCONTRADA',
        message: 'No se encontró la matrícula solicitada.',
        data: { code: 'MATRICULA_NO_ENCONTRADA', matricula }
      })
    }

    const rows = await getDeudoresGlobal({ ciclo, matricula, includeDesglose: true })
    return summarizeRows({ matricula, ciclo, rows, student, source: { type: 'direct' } })
  }

  const resolved = await resolveBridgeSource(matricula)
  const rows = await runWithBridgeAgentId(resolved.agentId, async () => {
    return await getDeudoresGlobal({ ciclo, matricula, includeDesglose: true })
  })

  return summarizeRows({
    matricula,
    ciclo,
    rows,
    student: resolved.student,
    source: { type: 'bridge', agentId: resolved.agentId }
  })
}
