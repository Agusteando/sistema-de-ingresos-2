export type BridgeQueryResponse = {
  ok?: boolean
  rows?: any
  result?: any
  data?: any
  response?: any
  payload?: any
  results?: any
  fields?: Array<{
    name: string
    table?: string
    orgTable?: string
    type?: number
  }>
  affectedRows?: number
  insertId?: number
  changedRows?: number
  warningStatus?: number
  protocolVersion?: string
  requestId?: string
  agentId?: string
  error?: {
    message?: string
    code?: string
    errno?: number
    sqlState?: string
  }
  code?: string
  message?: string
}

export type BridgeErrorResponse = BridgeQueryResponse & {
  ok: false
  error: {
    message?: string
    code?: string
    errno?: number
    sqlState?: string
  }
}

const bridgeObject = (value: any): Record<string, any> | null => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

const bridgeNestedValues = (value: any) => {
  const object = bridgeObject(value)
  if (!object) return []
  return ['data', 'response', 'payload', 'result']
    .map((key) => object[key])
    .filter((item) => item !== undefined && item !== null)
}

export const findBridgeErrorPayload = (value: any, depth = 0): BridgeErrorResponse | null => {
  if (depth > 5) return null
  const object = bridgeObject(value)
  if (!object) return null
  if (object.ok === false || object.error) return object as BridgeErrorResponse
  for (const nested of bridgeNestedValues(object)) {
    const found = findBridgeErrorPayload(nested, depth + 1)
    if (found) return found
  }
  return null
}

export const findBridgeQueryPayload = (value: any, depth = 0): any => {
  if (depth > 5) return null
  if (Array.isArray(value)) return { rows: value }
  const object = bridgeObject(value)
  if (!object) return null

  const hasDirectResult =
    Array.isArray(object.rows) ||
    Array.isArray(object.results) ||
    typeof object.affectedRows === 'number' ||
    typeof object.insertId === 'number' ||
    typeof object.changedRows === 'number' ||
    typeof object.warningStatus === 'number'

  if (hasDirectResult) return object

  for (const nested of bridgeNestedValues(object)) {
    const found = findBridgeQueryPayload(nested, depth + 1)
    if (found) return found
  }

  return object
}

export const findBridgeTransactionResults = (value: any, depth = 0): BridgeQueryResponse[] | null => {
  if (depth > 5) return null
  const object = bridgeObject(value)
  if (!object) return null
  if (Array.isArray(object.results)) return object.results
  for (const nested of bridgeNestedValues(object)) {
    const found = findBridgeTransactionResults(nested, depth + 1)
    if (found) return found
  }
  return null
}

export const normalizeBridgeQueryResult = <T>(payload: BridgeQueryResponse): T => {
  const normalized = findBridgeQueryPayload(payload) || payload
  const isWriteResult =
    typeof normalized?.affectedRows === 'number' ||
    typeof normalized?.insertId === 'number' ||
    typeof normalized?.changedRows === 'number' ||
    typeof normalized?.warningStatus === 'number'

  if (isWriteResult) {
    return {
      affectedRows: normalized.affectedRows || 0,
      insertId: normalized.insertId || 0,
      changedRows: normalized.changedRows || 0,
      warningStatus: normalized.warningStatus || 0
    } as T
  }

  if (Array.isArray(normalized?.rows)) return normalized.rows as T
  if (Array.isArray(normalized)) return normalized as T
  return normalized?.rows ?? normalized?.result ?? normalized as T
}
