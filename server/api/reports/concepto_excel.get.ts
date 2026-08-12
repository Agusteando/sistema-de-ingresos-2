import { runWithBridgeAgentId } from '../../utils/db'
import { loadConceptReport, loadConceptReportUsers } from '../../utils/concept-report'
import { normalizePaymentUserKeys } from '../../utils/payment-user'
import { buildProtectedXlsx } from '../../utils/protected-xlsx'

const safeFilePart = (value: unknown) => String(value || 'concepto')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'concepto'

const formatDate = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value)
  }

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw
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
  const availableUsers = await loadConceptReportUsers(user, filters)
  const requestedUserKeys = normalizePaymentUserKeys(filters.usuarios)
  const availableKeys = new Set(availableUsers.usuarios.map(option => option.key))

  if (availableUsers.usuarios.length > 1 && !requestedUserKeys.length) {
    throw createError({ statusCode: 400, message: 'Seleccione los usuarios que desea incluir en el Excel.' })
  }

  const invalidUserKeys = requestedUserKeys.filter(key => !availableKeys.has(key))
  if (invalidUserKeys.length) {
    throw createError({ statusCode: 400, message: 'La selección de usuarios ya no coincide con el reporte. Vuelva a intentarlo.' })
  }

  const selectedUserKeys = requestedUserKeys.length
    ? requestedUserKeys
    : availableUsers.usuarios.map(option => option.key)
  const selectedUsers = availableUsers.usuarios.filter(option => selectedUserKeys.includes(option.key))
  const result = await loadConceptReport(user, {
    ...filters,
    usuarios: selectedUserKeys,
  })
  const conceptNames = (result.conceptos || []).map((concept: any) => String(concept?.concepto || '')).filter(Boolean)
  const conceptName = conceptNames.length <= 3
    ? (conceptNames.join(', ') || 'Concepto')
    : `${conceptNames.slice(0, 2).join(', ')} +${conceptNames.length - 2}`
  const conceptNameById = new Map((result.conceptos || []).map((concept: any) => [String(concept?.id || ''), String(concept?.concepto || '')]))
  const creatorUser = event.context.user || {}
  const creatorName = String(creatorUser.nombre || creatorUser.name || creatorUser.email || 'Usuario')
  const creatorEmail = String(creatorUser.email || creatorUser.usuario_email || '').trim()
  const creator = creatorEmail && creatorEmail.toLowerCase() !== creatorName.toLowerCase()
    ? `${creatorName} <${creatorEmail}>`
    : creatorName

  const rows = result.rows.map(row => [
    Number(row.folio || 0),
    formatDate(row.fecha),
    row.matricula || '',
    row.ciclo || '',
    row.grado || '',
    row.nivel || '',
    row.nombreCompleto || '',
    Number(row.documento || 0),
    row.mesReal || row.mes || '',
    row.conceptoNombre || conceptNameById.get(String(row.concepto || '')) || conceptName,
    row.formaDePago || '',
    row.scopePlantel || row.plantel || '',
    formatRegisteringUser(row.usuario, row.usuario_email),
    row.estatusReporte || row.estatus || 'Vigente',
    row.cancelada_por || '',
    Number(row.montoRegistrado ?? row.monto ?? 0),
    Number(row.montoAplicado || 0),
  ])

  const periodLine = result.filtros.inicio || result.filtros.fin
    ? `Periodo: ${result.filtros.inicio || 'Inicio'} a ${result.filtros.fin || 'Fin'}`
    : 'Periodo: todos los movimientos registrados'

  const workbook = buildProtectedXlsx({
    sheetName: 'Reporte por concepto',
    title: 'Reporte por concepto',
    subtitle: conceptName,
    metaLines: [
      'Ciclos incluidos: todos',
      `Plantel: ${result.filtros.plantel || 'Todos'}`,
      periodLine,
      `Movimientos: ${result.resumen.transacciones} | Alumnos: ${result.resumen.alumnos}`,
      `Cancelados: ${result.resumen.cancelados || 0} | Depuraciones: ${result.resumen.depuraciones || 0}`,
      `Usuarios incluidos: ${selectedUsers.map(option => option.label).join(', ') || 'Sin movimientos'}`,
      'Los movimientos cancelados y las depuraciones permanecen visibles; su importe aplicado es 0 cuando corresponde, igual que en Corte de caja.',
    ],
    headers: [
      'Folio',
      'Fecha efectiva del pago',
      'Matrícula',
      'Ciclo del pago',
      'Grado',
      'Nivel',
      'Alumno',
      'Documento',
      'Mes',
      'Concepto',
      'Forma de pago',
      'Plantel',
      'Usuario que registró',
      'Estatus',
      'Cancelado por',
      'Monto registrado (MXN)',
      'Importe aplicado (MXN)',
    ],
    rows,
    numericColumns: [0, 7],
    currencyColumns: [15, 16],
    totals: [
      ...result.resumen.formasPago.map(item => ({ label: `${item.formaDePago} aplicado`, value: Number(item.total || 0) })),
      { label: 'Importe registrado', value: Number(result.resumen.totalRegistrado || 0) },
      { label: 'Importe no aplicado', value: Number(result.resumen.totalNoAplicado || 0) },
      { label: 'Importe aplicado', value: Number(result.resumen.total || 0) },
    ],
    creator,
  })

  const conceptFileLabel = conceptNames.length === 1 ? conceptNames[0] : `${conceptNames.length}_conceptos`
  const filename = `Reporte_conceptos_${safeFilePart(conceptFileLabel)}_todos_los_ciclos.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
}))
