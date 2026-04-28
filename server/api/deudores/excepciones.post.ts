import { query } from '../../utils/db'

const isValidDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export default defineEventHandler(async (event) => {
  const { matricula, ciclo, mes, fechaLimiteEspecial, motivo } = await readBody(event)
  const user = event.context.user

  const normalizedMatricula = String(matricula || '').trim()
  const normalizedCiclo = String(ciclo || '').trim()
  const normalizedMes = Number(mes || 0)
  const normalizedDate = String(fechaLimiteEspecial || '').trim()
  const normalizedMotivo = String(motivo || '').trim()

  if (!normalizedMatricula || !normalizedCiclo || !normalizedMes || !normalizedDate) {
    throw createError({ statusCode: 400, statusMessage: 'Datos incompletos para registrar la excepción.' })
  }

  if (!isValidDateKey(normalizedDate)) {
    throw createError({ statusCode: 400, statusMessage: 'La fecha límite debe tener formato AAAA-MM-DD.' })
  }

  if (!normalizedMotivo) {
    throw createError({ statusCode: 400, statusMessage: 'La nota de excepción es obligatoria.' })
  }

  await query(
    `INSERT INTO cobranza_excepciones (matricula, ciclo, mes, fecha_limite_especial, motivo, activa, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE fecha_limite_especial = VALUES(fecha_limite_especial), motivo = VALUES(motivo), activa = 1, created_by = VALUES(created_by)`,
    [normalizedMatricula, normalizedCiclo, normalizedMes, normalizedDate, normalizedMotivo, user.email || user.name || 'sistema']
  )

  return { success: true }
})