import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../../utils/db'
import { resolveControlEscolarTarget } from '../../../utils/control-escolar'
import { normalizeGradoForPlantel, resolveNivelEscolar } from '../../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { parseCurp } from '../../../../shared/utils/curp'

const hasOwn = (value: Record<string, any>, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const clean = (value: unknown) => String(value ?? '').trim()
const nullable = (value: unknown) => {
  const normalized = clean(value)
  return normalized || null
}

export default defineEventHandler(async (event) => {
  const matricula = clean(event.context.params?.matricula)
  const body = await readBody<Record<string, any>>(event)
  event.context.controlEscolarBodyAgentId = body.agentId || body.plantel
  const target = resolveControlEscolarTarget(event)

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  return await runWithBridgeAgentId(target.agentId, async () => {
    const [current] = await query<any[]>(`
      SELECT
        matricula,
        plantel,
        apellidoPaterno,
        apellidoMaterno,
        nombres,
        nombreCompleto,
        curp,
        genero,
        \`Fecha de nacimiento\` AS birth,
        \`Nombre del padre o tutor\` AS padre,
        telefono,
        correo,
        nivel,
        grado,
        grupo,
        ciclo,
        estatus
      FROM base
      WHERE matricula = ? AND plantel = ?
      LIMIT 1
    `, [matricula, target.plantel])

    if (!current) {
      throw createError({ statusCode: 404, message: 'Alumno no encontrado en el plantel seleccionado.' })
    }

    const setClauses: string[] = []
    const updateParams: any[] = []
    const changes: Record<string, { from: any; to: any }> = {}

    const addChange = (column: string, value: any, sourceKey: string = column) => {
      setClauses.push(`${column} = ?`)
      updateParams.push(value)
      changes[sourceKey] = { from: current[sourceKey], to: value }
    }

    const nextApellidoPaterno = hasOwn(body, 'apellidoPaterno') ? clean(body.apellidoPaterno) : current.apellidoPaterno
    const nextApellidoMaterno = hasOwn(body, 'apellidoMaterno') ? clean(body.apellidoMaterno) : current.apellidoMaterno
    const nextNombres = hasOwn(body, 'nombres') ? clean(body.nombres) : current.nombres
    const nameTouched = hasOwn(body, 'apellidoPaterno') || hasOwn(body, 'apellidoMaterno') || hasOwn(body, 'nombres')

    if (nameTouched) {
      const fullName = [nextApellidoPaterno, nextApellidoMaterno, nextNombres].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      addChange('apellidoPaterno', nextApellidoPaterno, 'apellidoPaterno')
      addChange('apellidoMaterno', nextApellidoMaterno, 'apellidoMaterno')
      addChange('nombres', nextNombres, 'nombres')
      setClauses.push('nombreCompleto = ?')
      updateParams.push(fullName)
      changes.nombreCompleto = { from: current.nombreCompleto, to: fullName }
    }

    if (hasOwn(body, 'curp')) {
      const rawCurp = clean(body.curp).toUpperCase()
      if (rawCurp) {
        const curpInfo = parseCurp(rawCurp)
        if (!curpInfo.isValid) {
          throw createError({ statusCode: 400, message: curpInfo.message || 'CURP inválida.' })
        }
        addChange('curp', curpInfo.normalized, 'curp')
        if (!hasOwn(body, 'birth')) addChange('`Fecha de nacimiento`', curpInfo.birthDate, 'birth')
        if (!hasOwn(body, 'genero')) addChange('genero', curpInfo.gender, 'genero')
      } else {
        addChange('curp', null, 'curp')
      }
    }

    if (hasOwn(body, 'birth')) addChange('`Fecha de nacimiento`', nullable(body.birth), 'birth')
    if (hasOwn(body, 'genero')) addChange('genero', nullable(body.genero), 'genero')
    if (hasOwn(body, 'padre')) addChange('`Nombre del padre o tutor`', nullable(body.padre), 'padre')
    if (hasOwn(body, 'telefono')) addChange('telefono', nullable(body.telefono), 'telefono')
    if (hasOwn(body, 'correo')) addChange('correo', nullable(body.correo), 'correo')
    if (hasOwn(body, 'grupo')) addChange('grupo', clean(body.grupo), 'grupo')
    if (hasOwn(body, 'estatus')) addChange('estatus', clean(body.estatus) || 'Activo', 'estatus')
    if (hasOwn(body, 'ciclo')) addChange('ciclo', normalizeCicloKey(body.ciclo), 'ciclo')

    if (hasOwn(body, 'nivel') || hasOwn(body, 'grado')) {
      const nextNivel = hasOwn(body, 'nivel')
        ? resolveNivelEscolar({ plantel: target.plantel, nivel: body.nivel })
        : resolveNivelEscolar({ plantel: target.plantel, nivel: current.nivel })
      const nextGrado = hasOwn(body, 'grado')
        ? normalizeGradoForPlantel(body.grado, target.plantel, nextNivel)
        : normalizeGradoForPlantel(current.grado, target.plantel, nextNivel)

      addChange('nivel', nextNivel, 'nivel')
      addChange('grado', nextGrado, 'grado')
    }

    if (!setClauses.length) {
      return { success: true, changed: false, changes: {} }
    }

    const statements: SqlStatement[] = [{
      sql: `UPDATE base SET ${setClauses.join(', ')} WHERE matricula = ? AND plantel = ?`,
      params: [...updateParams, matricula, target.plantel]
    }]

    await executeStatementTransaction(statements)

    console.info('[Control Escolar] student updated', {
      user: event.context.user?.email,
      agentId: target.agentId,
      matricula,
      fields: Object.keys(changes)
    })

    return { success: true, changed: true, agentId: target.agentId, matricula, changes }
  })
})
