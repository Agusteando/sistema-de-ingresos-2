import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { matricula, ciclo, mes, fechaLimiteEspecial, motivo } = await readBody(event)
  const user = event.context.user

  if (!matricula || !ciclo || !mes || !fechaLimiteEspecial) {
    throw createError({ statusCode: 400, statusMessage: 'Datos incompletos para excepción.' })
  }

  await query(
    `INSERT INTO cobranza_excepciones (matricula, ciclo, mes, fecha_limite_especial, motivo, activa, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE fecha_limite_especial = VALUES(fecha_limite_especial), motivo = VALUES(motivo), activa = 1, created_by = VALUES(created_by)`,
    [String(matricula), String(ciclo), Number(mes), String(fechaLimiteEspecial), String(motivo || ''), user.email || user.name || 'sistema']
  )

  return { success: true }
})
