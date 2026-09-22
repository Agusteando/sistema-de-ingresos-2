import { getTrustedAuthUser } from '../../../../utils/auth-session'
import { readInstitutionalSchoolCycle } from '../../../../utils/school-cycle'
import { readEffectiveStudentServicios } from '../../../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const matricula = getRouterParam(event, 'matricula')
  const query = getQuery(event)
  const institutional = await readInstitutionalSchoolCycle()
  const effective = await readEffectiveStudentServicios({
    matricula,
    ciclo: query.ciclo || institutional.key,
    plantel: query.plantel,
  })

  return {
    ok: true,
    source: 'central+financial',
    field: effective.current.field,
    raw: effective.current.raw,
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
    catalogSource: effective.resolved.catalogSource,
    financialEvidenceCount: effective.financial.evidenceCount,
  }
})
