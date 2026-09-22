import {
  executeStatementTransaction,
  runWithBridgeAgentId,
  type SqlStatement,
} from './db'

export const STUDENT_NAME_FIELDS = [
  'apellidoPaterno',
  'apellidoMaterno',
  'nombres',
] as const

export type StudentNameField = (typeof STUDENT_NAME_FIELDS)[number]

const NAME_FIELD_SET = new Set<string>(STUDENT_NAME_FIELDS)
const BRIDGE_NAME_COLUMN: Record<StudentNameField, string> = {
  apellidoPaterno: 'apellidoPaterno',
  apellidoMaterno: 'apellidoMaterno',
  nombres: 'nombres',
}

const clean = (value: unknown) => String(value ?? '').trim()
const hasOwn = (value: any, field: string) =>
  Boolean(value && Object.prototype.hasOwnProperty.call(value, field))

export const studentNameFieldsInPatch = (patch: any): StudentNameField[] =>
  Object.keys(patch || {})
    .filter((field): field is StudentNameField => NAME_FIELD_SET.has(field))

export const studentNameFieldsChanged = (
  before: any,
  after: any,
): StudentNameField[] =>
  STUDENT_NAME_FIELDS.filter(
    (field) =>
      hasOwn(after, field) &&
      clean(before?.[field]) !== clean(after?.[field]),
  )

export const syncStudentNamePatchToBridgeBase = async ({
  agentId,
  matricula,
  fields,
  values,
}: {
  agentId: string
  matricula: string
  fields: StudentNameField[]
  values: Record<string, unknown>
}) => {
  const normalizedAgentId = clean(agentId)
  const normalizedMatricula = clean(matricula)
  const requestedFields = Array.from(
    new Set((fields || []).filter((field) => NAME_FIELD_SET.has(field))),
  ) as StudentNameField[]

  if (!normalizedAgentId || !normalizedMatricula || !requestedFields.length) {
    return { success: true, skipped: true, fields: [] as StudentNameField[] }
  }

  const assignments = requestedFields.map(
    (field) => `${BRIDGE_NAME_COLUMN[field]} = ?`,
  )
  const params = requestedFields.map((field) => clean(values?.[field]))
  params.push(normalizedMatricula)

  const statements: SqlStatement[] = [
    {
      sql: `UPDATE base
            SET ${assignments.join(', ')}
            WHERE matricula = ?`,
      params,
    },
    {
      sql: `UPDATE base
            SET nombreCompleto = CONCAT(apellidoPaterno, ' ', apellidoMaterno, ' ', nombres)
            WHERE matricula = ?`,
      params: [normalizedMatricula],
    },
  ]

  await runWithBridgeAgentId(normalizedAgentId, async () => {
    await executeStatementTransaction(statements)
  })

  console.info('[StudentNameSync] Bridge base names synchronized', {
    agentId: normalizedAgentId,
    matricula: normalizedMatricula,
    fields: requestedFields,
  })

  return { success: true, skipped: false, fields: requestedFields }
}

export const scheduleStudentNameSync = (
  event: any,
  task: () => Promise<unknown>,
  context: Record<string, unknown> = {},
) => {
  const guarded = Promise.resolve()
    .then(task)
    .catch((error: any) => {
      console.warn('[StudentNameSync] Secondary name synchronization failed', {
        ...context,
        code: String(
          error?.code ||
            error?.data?.diagnostic?.code ||
            error?.diagnostic?.code ||
            '',
        ).trim() || undefined,
        message: String(
          error?.data?.message ||
            error?.statusMessage ||
            error?.message ||
            error,
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500),
      })
    })

  const waitUntil = event?.waitUntil
  if (typeof waitUntil === 'function') waitUntil.call(event, guarded)
  else void guarded
}
