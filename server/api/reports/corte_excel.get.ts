import { runWithBridgeAgentId } from '../../utils/db'
import { loadPlantelCorteCaja, loadPlantelCorteCajaUsers, normalizeCorteUserKeys } from '../../utils/corte-caja'
import { buildProtectedXlsx } from '../../utils/protected-xlsx'

const safeFilePart = (value: unknown) => String(value || 'plantel')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'plantel'

const formatDate = (value: unknown) => {
  if (!value) return ''
  const dateKey = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateKey
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
  const periodLabel = result.filtros.inicio && result.filtros.fin
    ? `${result.filtros.inicio} a ${result.filtros.fin}`
    : 'Periodo completo del ciclo'

  const workbook = buildProtectedXlsx({
    sheetName: 'Corte de Caja',
    title: 'Corte de Caja',
    subtitle: 'Movimientos registrados para el plantel seleccionado.',
    metaLines: [
      `Plantel: ${result.filtros.plantel}`,
      `Ciclo: ${result.filtros.ciclo} | Periodo: ${periodLabel} | Generado por: ${result.usuario.nombre}`,
      `Usuarios incluidos: ${selectedUsers.map(option => option.label).join(', ') || 'Sin movimientos'}`
    ],
    headers: [
      'Folio',
      'Fecha',
      'Matrícula',
      'Documento',
      'Mes',
      'Alumno',
      'Concepto',
      'Forma de pago',
      'Plantel',
      'Usuario que registró',
      'Monto (MXN)'
    ],
    rows: result.rows.map(row => [
      Number(row.folio || 0),
      formatDate(row.fecha),
      row.matricula,
      Number(row.documento || 0),
      row.mesReal || row.mes,
      row.nombreCompleto,
      row.conceptoNombre,
      row.formaDePago,
      row.scopePlantel || row.plantel || '',
      formatRegisteringUser(row.usuario, row.usuario_email),
      Number(row.monto || 0)
    ]),
    numericColumns: [0, 3],
    currencyColumns: [10],
    totals: [
      ...result.totales.map(total => ({ label: total.formaDePago, value: total.total })),
      { label: 'Importe total', value: result.total }
    ],
    creator: `${result.usuario.nombre} <${result.usuario.email}>`
  })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `Corte_de_Caja_Plantel_${safeFilePart(result.filtros.plantel)}_${today}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
}))
