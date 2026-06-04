import { bulkUpdateExternalUsers, getExternalUsersDiagnostics, isExternalUsersAvailable, queryExternalUsers } from '../../utils/external-users'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  const diagnostics = await getExternalUsersDiagnostics()
  throw createError({
    statusCode: 503,
    message: diagnostics?.errorMessage || 'No se pudo cargar el directorio de usuarios.',
    data: diagnostics
  })
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  if (method !== 'PATCH' && method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
  }

  await assertExternalUsersAvailable()
  const body = await readBody(event)
  const selectedPatch = body?.selectedPatch || {}
  const inversePatch = body?.inversePatch || {}
  const selectedEmails = Array.from(new Set((body?.selectedEmails || []).map(normalizeEmail).filter(Boolean)))

  if (!selectedEmails.length) {
    throw createError({ statusCode: 400, message: 'Seleccione usuarios para la acción inversa.' })
  }

  const scope = await queryExternalUsers({ ...(body?.filterScope || {}), page: 1, pageSize: 5000, bulk: true })
  const scopeEmails = Array.from(new Set((scope?.rows || []).map((row: any) => normalizeEmail(row.email)).filter(Boolean)))
  const scopeSet = new Set(scopeEmails)
  const selectedInScope = selectedEmails.filter((email) => scopeSet.has(email))
  const selectedSet = new Set(selectedInScope)
  const inverseEmails = scopeEmails.filter((email) => !selectedSet.has(email))

  if (!selectedInScope.length || !inverseEmails.length) {
    throw createError({ statusCode: 400, message: 'La acción inversa necesita seleccionados y resto dentro del alcance.' })
  }

  const selected = await bulkUpdateExternalUsers({ emails: selectedInScope, ...selectedPatch })
  const inverse = await bulkUpdateExternalUsers({ emails: inverseEmails, ...inversePatch })

  return {
    success: true,
    scopeMode: body?.scopeMode || 'current_filter',
    scopeTotal: scopeEmails.length,
    selected,
    inverse,
    rows: [...(selected?.rows || []), ...(inverse?.rows || [])]
  }
})
