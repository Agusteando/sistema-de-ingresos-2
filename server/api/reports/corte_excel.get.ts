import { runWithBridgeAgentId } from '../../utils/db'
import { loadPlantelCorteCaja, loadPlantelCorteCajaUsers, normalizeCorteUserKeys } from '../../utils/corte-caja'
import { buildProtectedXlsx } from '../../utils/protected-xlsx'

const safeFilePart = (value: unknown) => String(value || 'plantel')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'plantel'

const formatDateTime = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(value)
  }

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return raw
  const time = match[4] ? ` ${match[4]}:${match[5]}:${match[6] || '00'}` : ''
  return `${match[3]}/${match[2]}/${match[1]}${time}`
}

const comparableDateTime = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(value)
    const part = (type: string) => parts.find(item => item.type === type)?.value || '00'
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
  }

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return raw
  return `${match[1]}-${match[2]}-${match[3]} ${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`
}

const paymentDatesDiffer = (registeredAt: unknown, effectiveAt: unknown) => {
  const registered = comparableDateTime(registeredAt)
  const effective = comparableDateTime(effectiveAt)
  return Boolean(registered && effective && registered !== effective)
}

const formatRegisteringUser = (nameValue: unknown, emailValue: unknown) => {
  const name = String(nameValue || '').trim()
  const email = String(emailValue || '').trim().toLowerCase()

  if (name && email && name.toLowerCase() !== email) return `${name} (${email})`
  return email || name || 'No identificado'
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  const availableUsers = await loadPlantelCorteCajaUsers(user, filters)
  const requestedUserKeys = normalizeCorteUserKeys(filters.usuarios)
  const availableKeys = new Set(availableUsers.usuarios.map(option => option.key))

  if (availableUsers.usuarios.length > 1 && !requestedUserKeys.length) {
    throw createError({ statusCode: 400, message: 'Seleccione los usuarios que desea incluir en el Excel.' })
  }

  const invalidUserKeys = requestedUserKeys.filter(key => !availableKeys.has(key))
  if (invalidUserKeys.length) {
    throw createError({ statusCode: 400, message: 'La selección de usuarios ya no coincide con el periodo. Vuelva a intentarlo.' })
  }

  const selectedUserKeys = requestedUserKeys.length
    ? requestedUserKeys
    : availableUsers.usuarios.map(option => option.key)

  if (availableUsers.usuarios.length && !selectedUserKeys.length) {
    throw createError({ statusCode: 400, message: 'Seleccione al menos un usuario para generar el Excel.' })
  }

  const selectedUsers = availableUsers.usuarios.filter(option => selectedUserKeys.includes(option.key))
  const result = await loadPlantelCorteCaja(user, filters, { userKeys: selectedUserKeys })
  const periodLabel = result.filtros.inicio === result.filtros.fin
    ? result.filtros.inicio
    : `${result.filtros.inicio} a ${result.filtros.fin}`

  const excelRows = result.rows.map(row => [
    Number(row.folio || 0),
    formatDateTime(row.fecha),
    formatDateTime(row.fechaPago),
    row.matricula,
    row.ciclo || '',
    Number(row.documento || 0),
    row.mesReal || row.mes,
    row.nombreCompleto,
    row.conceptoNombre,
    row.formaDePago,
    row.scopePlantel || row.plantel || '',
    formatRegisteringUser(row.usuario, row.usuario_email),
    row.estatusCorte,
    Number(row.monto || 0),
    Number(row.montoAplicado || 0)
  ])
  const highlightedCells = result.rows.flatMap((row, rowIndex) => (
    paymentDatesDiffer(row.fecha, row.fechaPago)
      ? [{ rowIndex, columnIndexes: [1, 2] }]
      : []
  ))

  const workbook = buildProtectedXlsx({
    sheetName: 'Corte de Caja',
    title: 'Corte de Caja',
    subtitle: 'Bitácora de movimientos incluidos por fecha efectiva de pago para el plantel seleccionado.',
    metaLines: [
      `Plantel: ${result.filtros.plantel}`,
      `Periodo por fecha efectiva de pago: ${periodLabel} | Generado por: ${result.usuario.nombre}`,
      'Fechas resaltadas: la fecha de registro difiere de la fecha efectiva del pago.',
      'Ciclos incluidos: todos',
      `Usuarios incluidos: ${selectedUsers.map(option => option.label).join(', ') || 'Sin movimientos'}`
    ],
    headers: [
      'Folio',
      'Fecha de registro',
      'Fecha efectiva del pago',
      'Matrícula',
      'Ciclo',
      'Documento',
      'Mes',
      'Alumno',
      'Concepto',
      'Forma de pago',
      'Plantel',
      'Usuario que registró',
      'Estatus',
      'Monto registrado (MXN)',
      'Importe al corte (MXN)'
    ],
    rows: excelRows,
    numericColumns: [0, 5],
    highlightedCells,
    currencyColumns: [13, 14],
    totals: [
      ...result.totales.map(total => ({ label: `${total.formaDePago} aplicado`, value: total.total })),
      { label: 'Importe registrado', value: result.totalRegistrado },
      { label: 'Importe no aplicado', value: result.totalNoAplicado },
      { label: 'Importe total al corte', value: result.total }
    ],
    creator: `${result.usuario.nombre} <${result.usuario.email}>`
  })

  const periodFilePart = result.filtros.inicio === result.filtros.fin
    ? result.filtros.inicio
    : `${result.filtros.inicio}_${result.filtros.fin}`
  const filename = `Corte_de_Caja_Plantel_${safeFilePart(result.filtros.plantel)}_${safeFilePart(periodFilePart)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
}))
