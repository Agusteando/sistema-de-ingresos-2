import { bulkUpdateExternalUsers, getExternalUsersDiagnostics, isExternalUsersAvailable, listExternalUsers } from '../../utils/external-users'

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
const compactSample = (values: string[], limit = 8) => values.slice(0, limit)

const inverseError = (message: string, data: Record<string, unknown>) => createError({
  statusCode: 400,
  message,
  data
})

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
  const selectedEmails = Array.from(new Set((body?.selectedEmails || [])
    .map(normalizeEmail)
    .filter(Boolean)))

  if (!selectedEmails.length) {
    throw inverseError('Selecciona al menos un usuario para aplicar la acción inversa.', {
      reason: 'empty_selected',
      selectedCount: 0
    })
  }

  // Inversa is intentionally global: filters are ignored. The selected set receives
  // selectedPatch, and every other institutional user receives inversePatch.
  const directoryRows = await listExternalUsers('')
  const directoryEmails = Array.from(new Set((directoryRows || [])
    .map((row: any) => normalizeEmail(row.email))
    .filter(Boolean)))
  const directorySet = new Set(directoryEmails)
  const selectedInDirectory = selectedEmails.filter((email) => directorySet.has(email))
  const selectedSet = new Set(selectedEmails)
  const missingSelected = selectedEmails.filter((email) => !directorySet.has(email))
  const inverseEmails = directoryEmails.filter((email) => !selectedSet.has(email))

  if (!directoryEmails.length) {
    throw inverseError('No se encontraron usuarios institucionales en el directorio externo.', {
      reason: 'empty_directory',
      selectedCount: selectedEmails.length,
      directoryCount: 0,
      selectedSample: compactSample(selectedEmails)
    })
  }

  if (!selectedInDirectory.length) {
    throw inverseError('Ninguno de los usuarios seleccionados existe en el directorio externo.', {
      reason: 'selected_not_in_directory',
      selectedCount: selectedEmails.length,
      directoryCount: directoryEmails.length,
      missingSelectedCount: missingSelected.length,
      selectedSample: compactSample(selectedEmails),
      missingSelectedSample: compactSample(missingSelected)
    })
  }

  if (!inverseEmails.length) {
    throw inverseError('Seleccionaste todos los usuarios del directorio; no existe un grupo inverso para actualizar.', {
      reason: 'empty_inverse_group',
      selectedCount: selectedEmails.length,
      selectedInDirectoryCount: selectedInDirectory.length,
      directoryCount: directoryEmails.length,
      missingSelectedCount: missingSelected.length,
      selectedSample: compactSample(selectedEmails),
      missingSelectedSample: compactSample(missingSelected)
    })
  }

  const selected = await bulkUpdateExternalUsers({ emails: selectedInDirectory, ...selectedPatch })
  const inverse = await bulkUpdateExternalUsers({ emails: inverseEmails, ...inversePatch })

  return {
    success: true,
    scopeMode: 'all_directory',
    scopeTotal: directoryEmails.length,
    selectedDirectoryCount: selectedInDirectory.length,
    inverseDirectoryCount: inverseEmails.length,
    missingSelectedCount: missingSelected.length,
    missingSelected: compactSample(missingSelected, 20),
    selected,
    inverse,
    rows: [...(selected?.rows || []), ...(inverse?.rows || [])]
  }
})
