import { query } from '../../utils/db'

const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')
const cleanName = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120)
const cleanOptional = (value: unknown, limit: number) => {
  const next = String(value || '').replace(/\s+/g, ' ').trim()
  return next ? next.slice(0, limit) : null
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const name = cleanName(body.name)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Nombre de seccion requerido.' })
  }

  const plantel = isScopedToActivePlantel(user)
    ? String(user.active_plantel || '').trim()
    : cleanOptional(body.plantel, 255) || 'GLOBAL'

  if (!plantel) {
    throw createError({ statusCode: 400, message: 'Plantel requerido para crear la seccion.' })
  }

  await query<any>(`
    INSERT INTO student_custom_sections (name, plantel, description, color, sort_order)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      is_active = 1,
      description = VALUES(description),
      color = VALUES(color),
      updated_at = CURRENT_TIMESTAMP
  `, [
    name,
    plantel,
    cleanOptional(body.description, 255),
    cleanOptional(body.color, 32),
    Number(body.sortOrder || 0)
  ])

  const [section] = await query<any[]>(`
    SELECT id, name, plantel, description, color, sort_order AS sortOrder
    FROM student_custom_sections
    WHERE plantel = ? AND name = ?
    LIMIT 1
  `, [plantel, name])

  return {
    ...section,
    id: Number(section.id),
    studentCount: 0
  }
})
