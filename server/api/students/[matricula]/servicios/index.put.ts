import { getTrustedAuthUser } from '../../../../utils/auth-session'
import { readBestTalleresServiciosCatalog, readEffectiveStudentServicios, updateCentralMatriculaServicio } from '../../../../utils/talleres-servicios'
import { readInstitutionalSchoolCycle } from '../../../../utils/school-cycle'
import { canonicalTallerKey, normalizeServicioClave, normalizeServicioNombre } from '../../../../../shared/utils/talleresServicios'
import { recordTalleresAssignmentChange } from '../../../../utils/talleres-contracts'
import { canonicalTalleresPlantel, ensureCurrentTalleresSnapshotPlantel, invalidateTalleresSnapshotPlantel } from '../../../../utils/talleres-snapshot'

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

  // Resolve the cycle before the authoritative write. Once matricula is changed,
  // every remaining enrichment/refresh step below is best-effort and must not
  // turn that successful write into a generic 500.
  const institutional = await readInstitutionalSchoolCycle()
  const requestedCiclo = body?.ciclo || institutional.key

  const updated = await updateCentralMatriculaServicio({
    matricula,
    action,
    servicio: serviceName,
    userEmail: user.email,
  })

  let historyWrite: any = { ready: false }
  try {
    historyWrite = await recordTalleresAssignmentChange({
      matricula,
      plantel: body?.plantel || 'GLOBAL',
      workshopKey: canonicalTallerKey(serviceName),
      workshopName: serviceName,
      action: action === 'add' ? 'assigned' : 'removed',
      actorEmail: user.email,
      metadata: { source: 'aurora_manual' },
    })
  } catch (error: any) {
    console.error('[StudentServicios] No se pudo registrar historial de Talleres.', {
      matricula,
      action,
      servicio: serviceName,
      plantel: body?.plantel || 'GLOBAL',
      message: error?.message || error,
      code: error?.code || error?.statusMessage || null,
    })
    if (action === 'remove') {
      throw createError({
        statusCode: 503,
        message: 'El taller se actualizó en Control Escolar, pero no se pudo confirmar su baja en el historial de Talleres. Vuelve a intentarlo.',
      })
    }
    historyWrite = { ready: false, error: error?.message || 'history_write_failed' }
  }

  if (action === 'remove' && historyWrite?.ready === false) {
    throw createError({
      statusCode: 503,
      message: 'El taller se actualizó en Control Escolar, pero no se pudo confirmar su baja en el historial de Talleres. Vuelve a intentarlo.',
    })
  }

  let effective: any
  try {
    effective = await readEffectiveStudentServicios({
      matricula,
      ciclo: requestedCiclo,
      plantel: body?.plantel,
    })
  } catch (error: any) {
    console.error('[StudentServicios] La asignación se guardó, pero falló la lectura enriquecida posterior.', {
      matricula,
      action,
      servicio: serviceName,
      plantel: body?.plantel || null,
      ciclo: requestedCiclo,
      message: error?.message || error,
      code: error?.code || error?.statusMessage || null,
    })
    const catalogByKey = new Map(catalog.map((item) => [item.servicio_clave, item]))
    const resolved = {
      catalog,
      catalogSource: 'mutation-fallback',
      servicios: updated.servicios.map((value) => {
        const nombre = normalizeServicioNombre(value)
        const clave = canonicalTallerKey(nombre)
        const item = catalogByKey.get(clave)
        return {
          clave,
          nombre: item?.servicio_nombre || nombre,
          imagen: item?.imagen_url || (clave ? `/talleres-servicios/${clave}.svg` : ''),
          source: item ? 'catalog' : 'legacy',
        }
      }),
    }
    effective = {
      current: {
        field: updated.field,
        raw: updated.raw,
      },
      resolved,
      financial: { evidenceCount: 0 },
      ciclo: String(requestedCiclo || ''),
      plantel: String(body?.plantel || '').trim().toUpperCase(),
      servicios: resolved.servicios.map((item) => ({
        ...item,
        fuentes: ['matricula'],
        directa: true,
        conceptosFinancieros: [],
      })),
    }
  }

  const snapshotPlantel = canonicalTalleresPlantel(effective.plantel || body?.plantel)
  let snapshotRefresh: any = { success: true, skipped: true, reason: 'plantel_not_in_talleres_snapshot' }
  if (snapshotPlantel) {
    try {
      await invalidateTalleresSnapshotPlantel({ plantel: snapshotPlantel, ciclo: effective.ciclo })
      snapshotRefresh = { success: true, invalidated: true, queued: true, plantel: snapshotPlantel, ciclo: effective.ciclo }

      // The authoritative matricula/history write is already complete. Rebuilding
      // the materialized Talleres roster must not hold the operator request open
      // or turn a successful assignment into a 500. The invalidation above means
      // no consumer may knowingly serve the previous snapshot meanwhile.
      void ensureCurrentTalleresSnapshotPlantel({
        plantel: snapshotPlantel,
        ciclo: effective.ciclo,
        force: false,
      }).catch((error: any) => {
        console.error('[StudentServicios] Falló el refresh asíncrono del snapshot de Talleres.', {
          matricula,
          action,
          servicio: serviceName,
          plantel: snapshotPlantel,
          ciclo: effective.ciclo,
          message: error?.message || error,
          code: error?.code || error?.statusMessage || null,
        })
      })
    } catch (error: any) {
      console.error('[StudentServicios] La asignación se guardó, pero no se pudo invalidar el snapshot de Talleres.', {
        matricula,
        action,
        servicio: serviceName,
        plantel: snapshotPlantel,
        ciclo: effective.ciclo,
        message: error?.message || error,
        code: error?.code || error?.statusMessage || null,
      })
      snapshotRefresh = {
        success: false,
        invalidated: false,
        queued: false,
        message: error?.message || 'snapshot_invalidation_failed',
      }
    }
  }

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
    historyReady: historyWrite?.ready !== false,
    snapshotRefresh,
  }
})
