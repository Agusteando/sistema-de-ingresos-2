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

  // Inversa is intentionally global: filters are ignored. The selected set receives
  // selectedPatch, and every other institutional user receives inversePatch.
  const directory = await queryExternalUsers({ search: '', plantel: 'all', access: 'all', status: 'all', activity: 'all', sort: 'last_login_desc', page: 1, pageSize: 5000, bulk: true })
  const directoryEmails = Array.from(new Set((directory?.rows || []).map((row: any) => normalizeEmail(row.email)).filter(Boolean)))
  const directorySet = new Set(directoryEmails)
  const selectedInDirectory = selectedEmails.filter((email) => directorySet.has(email))
  const selectedSet = new Set(selectedInDirectory)
  const inverseEmails = directoryEmails.filter((email) => !selectedSet.has(email))

  if (!selectedInDirectory.length || !inverseEmails.length) {
    throw createError({ statusCode: 400, message: 'La acción inversa necesita seleccionados y resto dentro del directorio.' })
  }

  const selected = await bulkUpdateExternalUsers({ emails: selectedInDirectory, ...selectedPatch })
  const inverse = await bulkUpdateExternalUsers({ emails: inverseEmails, ...inversePatch })

  return {
    success: true,
    scopeMode: 'all_directory',
    scopeTotal: directoryEmails.length,
    selected,
    inverse,
    rows: [...(selected?.rows || []), ...(inverse?.rows || [])]
  }
})
