import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { matricula, ciclo, texto } = await readBody(event)
  const user = event.context.user

  if (!matricula || !ciclo || !texto) {
    throw createError({ statusCode: 400, statusMessage: 'matricula, ciclo y texto son requeridos.' })
  }

  await query(
    `INSERT INTO cobranza_observaciones (matricula, ciclo, texto, usuario, fecha) VALUES (?, ?, ?, ?, NOW())`,
    [String(matricula), String(ciclo), String(texto), user.email || user.name || 'sistema']
  )

  return { success: true }
})
