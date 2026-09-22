import { getTrustedAuthUser } from '../../../../utils/auth-session'
import { readBestTalleresServiciosCatalog, readEffectiveStudentServicios, updateCentralMatriculaServicio } from '../../../../utils/talleres-servicios'
import { readInstitutionalSchoolCycle } from '../../../../utils/school-cycle'
import { canonicalTallerKey, normalizeServicioClave, normalizeServicioNombre } from '../../../../../shared/utils/talleresServicios'
import { recordTalleresAssignmentChange } from '../../../../utils/talleres-contracts'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const matricula = getRouterParam(event, 'matricula')
  const body = await readBody(event).catch(() => ({}))
  const action = String(body?.action || '').trim().toLowerCase() === 'remove' ? 'remove' : 'add'
  const requestedKey = normalizeServicioClave(body?.servicio_clave || body?.clave || body?.servicio || body?.nombre)
  const requestedName = normalizeServicioNombre(body?.servicio_nombre || body?.nombre || body?.servicio)

  if (!requestedKey && !requestedName) {
    throw createError({ statusCode: 400, message: 'Selecciona un taller o servicio.' })
  }

  const { catalog } = await readBestTalleresServiciosCatalog()
  const catalogMatch = catalog.find((item) => item.servicio_clave === requestedKey || normalizeServicioClave(item.servicio_nombre) === requestedKey)
  if (action === 'add' && !catalogMatch && requestedName) {
    throw createError({ statusCode: 400, message: 'El taller seleccionado no está en el catálogo activo.' })
  }
  if (action === 'add' && !catalogMatch) {
    throw createError({ statusCode: 400, message: 'El taller seleccionado no está en el catálogo activo.' })
  }

  const serviceName = action === 'add'
    ? catalogMatch!.servicio_nombre
    : (catalogMatch?.servicio_nombre || requestedName || requestedKey)

  const updated = await updateCentralMatriculaServicio({
    matricula,
    action,
    servicio: serviceName,
    userEmail: user.email,
  })
  if (updated.changed) {
    await recordTalleresAssignmentChange({
      matricula,
      plantel: body?.plantel || 'GLOBAL',
      workshopKey: canonicalTallerKey(serviceName),
      workshopName: serviceName,
      action: action === 'add' ? 'assigned' : 'removed',
      actorEmail: user.email,
      metadata: { source: 'aurora_manual' },
    })
  }
  const institutional = await readInstitutionalSchoolCycle()
  const effective = await readEffectiveStudentServicios({
    matricula,
    ciclo: body?.ciclo || institutional.key,
    plantel: body?.plantel,
  })

  return {
    ok: true,
    action,
    changed: updated.changed,
    source: 'central+financial',
    field: updated.field,
    raw: updated.raw,
    ciclo: effective.ciclo,
    plantel: effective.plantel,
    servicios: effective.servicios,
    catalog: effective.resolved.catalog.map((item) => ({
      clave: item.servicio_clave,
      nombre: item.servicio_nombre,
      imagen: item.imagen_url,
      activo: Number(item.activo || 0) !== 0,
      orden: Number(item.orden || 9999),
    })),
    financialEvidenceCount: effective.financial.evidenceCount,
  }
})
