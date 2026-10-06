import { normalizeCicloForTipoIngreso, resolveTipoIngreso } from './tipoIngreso'
import { formatCicloLabel } from './ciclo'

/** Additive public contract. Unknown evidence must never become a false Yes. */
export const nuevoIngresoForStudent = (student: any, ciclo: unknown) => {
  const cicloKey = normalizeCicloForTipoIngreso(ciclo)
  const ingreso = normalizeCicloForTipoIngreso(student?.cicloBase)
  const source = student?.tipoIngresoSource || ''
  const value = student?.tipoIngresoValue
  const hasCanonicalValue = ['interno', 'externo'].includes(value)
  const resolved = resolveTipoIngreso(student, cicloKey)
  const knownSource = ['manual_override', 'ingreso_anchor', 'confirmed_conceptos'].includes(source)
  const known = Boolean(cicloKey && (knownSource || (ingreso && Number(ingreso) <= Number(cicloKey))))
  const nuevoIngreso = known
    ? (hasCanonicalValue ? value === 'externo' : resolved.value === 'externo')
    : null
  return {
    nuevoIngreso,
    cicloIngreso: ingreso ? formatCicloLabel(ingreso) : null,
    nuevoIngresoCiclo: cicloKey ? formatCicloLabel(cicloKey) : null,
    nuevoIngresoFuente: known ? (knownSource ? source : hasCanonicalValue ? 'tipo_ingreso_snapshot' : resolved.source) : 'sin_dato',
  }
}

export const withNuevoIngreso = (response: any, ciclo: unknown) => ({
  ...response,
  data: Array.isArray(response?.data)
    ? response.data.map((student: any) => ({ ...student, ...nuevoIngresoForStudent(student, ciclo) }))
    : response?.data ? { ...response.data, ...nuevoIngresoForStudent(response.data, ciclo) } : response?.data,
})
