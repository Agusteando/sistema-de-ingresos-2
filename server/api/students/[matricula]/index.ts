import { query } from '../../../utils/db'
import { normalizeGrado } from '../../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const method = event.node.req.method

  if (method === 'PUT') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.ciclo)
    await query(`
      UPDATE base SET 
        apellidoPaterno = ?, apellidoMaterno = ?, nombres = ?, nombreCompleto = CONCAT(?, ' ', ?, ' ', ?),
        \`Fecha de nacimiento\` = ?, \`Nombre del padre o tutor\` = ?, plantel = ?, nivel = ?, grado = ?, grupo = ?, telefono = ?, correo = ?, ciclo = ?, interno = ?, estatus = ?
      WHERE matricula = ?
    `, [
      body.apellidoPaterno, body.apellidoMaterno, body.nombres, body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.birth, body.padre, body.plantel, body.nivel, normalizeGrado(body.grado), body.grupo, body.telefono, body.correo, cicloKey, body.interno, body.estatus || 'Activo',
      matricula
    ])
    return { success: true }
  }

  if (method === 'DELETE') {
    const body = await readBody(event)
    await query(`UPDATE base SET estatus = ? WHERE matricula = ?`, [body.motivo || 'Baja', matricula])
    return { success: true }
  }
})
