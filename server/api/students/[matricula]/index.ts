import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const method = event.node.req.method

  if (method === 'PUT') {
    const body = await readBody(event)
    await query(`
      UPDATE base SET 
        apellidoPaterno = ?, apellidoMaterno = ?, nombres = ?, nombreCompleto = ?,
        birth = ?, padre = ?, plantel = ?, nivel = ?, grado = ?, grupo = ?, telefono = ?, correo = ?, ciclo = ?
      WHERE matricula = ?
    `, [
      body.apellidoPaterno, body.apellidoMaterno, body.nombres, body.nombreCompleto,
      body.birth, body.padre, body.plantel, body.nivel, body.grado, body.grupo, body.telefono, body.correo, body.ciclo,
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