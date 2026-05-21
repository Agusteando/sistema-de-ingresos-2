import { runWithBridgeAgentId, query } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../../shared/utils/grado'
import { generateBecaCartaPdf } from '../../../utils/becaCartaPdf'

const parseBecaTypes = (value: unknown) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const safeFilePart = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'alumno'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const documentoId = Number(event.context.params?.id)
  const { ciclo } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  if (!documentoId) throw createError({ statusCode: 400, message: 'Documento requerido.' })

  const [doc] = await query<any[]>(`
    SELECT
      D.documento, D.concepto, D.conceptoNombre, D.matricula, D.costo, D.montoFinal,
      D.beca, D.becaNombre, D.becaTipos, D.becaMotivo, D.becaMonto, D.becaPorcentaje,
      D.ciclo, D.estatus, D.fecha,
      B.nombreCompleto, B.apellidoPaterno, B.apellidoMaterno, B.nombre,
      B.plantel, B.nivel, B.grado, B.grupo,
      B.plantel as plantelBase, B.nivel as nivelBase, B.grado as gradoBase, B.ciclo as cicloBase
    FROM documentos D
    LEFT JOIN base B ON B.matricula = D.matricula
    WHERE D.documento = ?
    LIMIT 1
  `, [documentoId])

  if (!doc) throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  if (cicloKey && normalizeCicloKey(doc.ciclo) !== cicloKey) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado en el ciclo seleccionado.' })
  }
  if (String(doc.estatus || '').toLowerCase() !== 'activo') {
    throw createError({ statusCode: 409, message: 'El documento no esta activo.' })
  }

  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')
  if (!isInProjectedPlantelScopeForCiclo(
    doc.gradoBase,
    doc.plantelBase,
    doc.cicloBase,
    normalizeCicloKey(doc.ciclo),
    doc.nivelBase,
    isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
  )) {
    throw createError({ statusCode: isScopedToActivePlantel ? 403 : 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }

  const becaTipos = parseBecaTypes(doc.becaTipos || doc.becaNombre)
  if (!becaTipos.length) {
    throw createError({ statusCode: 409, message: 'Este documento no tiene tipo de beca registrado.' })
  }

  await query<any>(`
    UPDATE documentos
    SET becaCartaGenerada = 1, becaCartaFecha = NOW()
    WHERE documento = ?
  `, [documentoId])

  const pdf = generateBecaCartaPdf({
    student: doc,
    documento: doc,
    becaTipos,
    motivo: doc.becaMotivo,
    ciclo: normalizeCicloKey(doc.ciclo),
    generatedBy: user?.nombre || user?.email || user?.username || 'Sistema'
  })

  const filename = `carta-beca-${safeFilePart(doc.matricula)}-${documentoId}.pdf`
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `inline; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return pdf
}))
