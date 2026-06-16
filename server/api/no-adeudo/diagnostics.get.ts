type DiagnosticItem = {
  title: string
  detail: string
  statusCode?: number
  source: string
  code?: string
  missing?: string[]
  action?: string
  level?: 'error' | 'warning' | 'ok'
}

type RuntimeNoAdeudoDiagnosticConfig = {
  dbTransport?: string
  dbBridgeAgentId?: string
  controlEscolarMysqlHost?: string
  controlEscolarMysqlPort?: string | number
  controlEscolarMysqlUser?: string
  controlEscolarMysqlPassword?: string
  controlEscolarMysqlDatabase?: string
  googlePrivateKey?: string
  adminEmailToImpersonate?: string
}

const normalize = (value: unknown) => String(value || '').trim()
const hasValue = (value: unknown) => Boolean(normalize(value))
const redact = (value: unknown) => hasValue(value) ? 'configurado' : 'faltante'

const makeItem = (item: DiagnosticItem) => item

const classifyCentralDbError = (error: any): DiagnosticItem => {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase()
  const message = normalize(error?.message || error?.statusMessage || error?.sqlMessage || error?.cause?.message)
  const combined = [message, code].filter(Boolean).join(' | ')

  if (code === 'ER_NO_SUCH_TABLE' || /no_adeudo_deudor_cartas/i.test(combined)) {
    return makeItem({
      level: 'error',
      title: 'Falta crear la tabla externa no_adeudo_deudor_cartas.',
      detail: 'La base externa responde, pero no existe la tabla de control para cartas emitidas a alumnos detectados con adeudo.',
      statusCode: 500,
      source: 'Control externo de cartas con adeudo',
      code: code || undefined,
      missing: ['tabla externa no_adeudo_deudor_cartas'],
      action: 'Ejecuta manualmente el CREATE TABLE en la base externa/control, no en la base bridge.'
    })
  }

  if (['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(code) || /access denied|acceso denegado/i.test(combined)) {
    return makeItem({
      level: 'error',
      title: 'La conexión a la base externa fue rechazada.',
      detail: 'Las credenciales CONTROL_ESCOLAR_MYSQL_USER / CONTROL_ESCOLAR_MYSQL_PASSWORD o sus permisos no permiten acceder a la base configurada.',
      statusCode: 500,
      source: 'Control externo de cartas con adeudo',
      code: code || undefined,
      action: 'Valida usuario, contraseña, permisos y CONTROL_ESCOLAR_MYSQL_DATABASE.'
    })
  }

  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(code) || /connect|timeout|timed out|refused|ENOTFOUND/i.test(combined)) {
    return makeItem({
      level: 'error',
      title: 'No se pudo conectar a la base externa de Control Escolar.',
      detail: 'Aurora no pudo abrir conexión con CONTROL_ESCOLAR_MYSQL_HOST / CONTROL_ESCOLAR_MYSQL_PORT.',
      statusCode: 500,
      source: 'Control externo de cartas con adeudo',
      code: code || undefined,
      action: 'Valida host, puerto, red/firewall y que MySQL acepte conexiones desde el servidor de Aurora.'
    })
  }

  return makeItem({
    level: 'error',
    title: 'No se pudo validar el control externo de cartas con adeudo.',
    detail: message || 'La consulta de diagnóstico a la base externa falló sin detalle específico.',
    statusCode: 500,
    source: 'Control externo de cartas con adeudo',
    code: code || undefined,
    action: 'Revisa el log del servidor para el stack completo de la conexión externa.'
  })
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const config = useRuntimeConfig() as unknown as RuntimeNoAdeudoDiagnosticConfig
  const diagnostics: DiagnosticItem[] = []
  const checks: DiagnosticItem[] = []
  const add = (item: DiagnosticItem) => {
    const normalized = makeItem(item)
    checks.push(normalized)
    if (normalized.level !== 'ok') diagnostics.push(normalized)
  }

  const transport = normalize(config.dbTransport || 'direct').toLowerCase()
  const requestAgent = normalize(event.context.dbBridgeAgentId)
  const configuredAgent = normalize(config.dbBridgeAgentId)

  if (transport === 'bridge' && !requestAgent && !configuredAgent) {
    add({
      level: 'error',
      title: 'No se detectó plantel/agente de datos para la sesión.',
      detail: 'El endpoint necesita un DB bridge agent para consultar alumnos, documentos y pagos.',
      statusCode: 401,
      source: 'DB bridge',
      code: 'MISSING_DB_BRIDGE_AGENT',
      missing: ['event.context.dbBridgeAgentId o DB_BRIDGE_AGENT_ID'],
      action: 'Vuelve a iniciar sesión con plantel activo o configura DB_BRIDGE_AGENT_ID si el servidor opera con un agente fijo.'
    })
  } else {
    checks.push({
      level: 'ok',
      title: 'Contexto de base del plantel detectado.',
      detail: transport === 'bridge' ? `Bridge agent: ${requestAgent || configuredAgent}` : 'DB_TRANSPORT=direct.',
      source: 'DB bridge'
    })
  }

  try {
    await import('../../utils/noAdeudo')
    checks.push({
      level: 'ok',
      title: 'Módulo de Carta de No Adeudo cargado.',
      detail: 'El backend pudo importar server/utils/noAdeudo.ts.',
      source: 'Backend no-adeudo'
    })
  } catch (error: any) {
    add({
      level: 'error',
      title: 'No se pudo cargar el módulo de Carta de No Adeudo.',
      detail: normalize(error?.message) || 'Falló el import dinámico de server/utils/noAdeudo.ts.',
      statusCode: 500,
      source: 'Backend no-adeudo',
      code: normalize(error?.code || error?.name) || 'NO_ADEUDO_MODULE_LOAD',
      action: 'Revisa el log del servidor; suele ser una dependencia faltante, error de sintaxis o import inválido.'
    })
  }

  const missingCentral = [
    ['CONTROL_ESCOLAR_MYSQL_HOST', config.controlEscolarMysqlHost],
    ['CONTROL_ESCOLAR_MYSQL_USER', config.controlEscolarMysqlUser],
    ['CONTROL_ESCOLAR_MYSQL_DATABASE', config.controlEscolarMysqlDatabase],
  ].filter(([, value]) => !hasValue(value)).map(([name]) => String(name))

  if (missingCentral.length) {
    add({
      level: 'warning',
      title: `Falta configuración de base externa: ${missingCentral.join(', ')}.`,
      detail: 'La vista previa puede prepararse, pero si el alumno tiene adeudo no se podrá validar/escribir la marca externa de control al enviar.',
      statusCode: 500,
      source: 'Control externo de cartas con adeudo',
      missing: missingCentral,
      action: 'Configura las variables faltantes en el ambiente del servidor y reinicia Aurora.'
    })
  } else {
    checks.push({
      level: 'ok',
      title: 'Variables de base externa presentes.',
      detail: `HOST=${redact(config.controlEscolarMysqlHost)} · USER=${redact(config.controlEscolarMysqlUser)} · DATABASE=${redact(config.controlEscolarMysqlDatabase)}`,
      source: 'Control externo de cartas con adeudo'
    })

    try {
      const { controlEscolarCentralQuery } = await import('../../utils/control-escolar-central')
      await controlEscolarCentralQuery<any[]>('SELECT 1 FROM `no_adeudo_deudor_cartas` LIMIT 1')
      checks.push({
        level: 'ok',
        title: 'Tabla externa no_adeudo_deudor_cartas disponible.',
        detail: 'Aurora puede validar el control externo para cartas generadas con advertencia de adeudo.',
        source: 'Control externo de cartas con adeudo'
      })
    } catch (error: any) {
      add(classifyCentralDbError(error))
    }
  }

  if (!missingCentral.length) {
    try {
      const { noAdeudoControlUsersColumnExists, NO_ADEUDO_CONTROL_PLANTELES_COLUMN } = await import('../../utils/external-users')
      const hasAssignmentColumn = await noAdeudoControlUsersColumnExists()
      if (!hasAssignmentColumn) {
        add({
          level: 'warning',
          title: 'Falta la columna externa para recordar Control Escolar por plantel.',
          detail: `La selección del usuario ROLE_CTRL necesita users.${NO_ADEUDO_CONTROL_PLANTELES_COLUMN}.`,
          source: 'Destinatarios',
          missing: [`users.${NO_ADEUDO_CONTROL_PLANTELES_COLUMN}`],
          action: 'Ejecuta manualmente el ALTER TABLE indicado para habilitar el selector del modal.'
        })
      } else {
        checks.push({
          level: 'ok',
          title: 'Columna de destinatario Control Escolar disponible.',
          detail: `La tabla externa users permite recordar la selección por plantel.`,
          source: 'Destinatarios'
        })
      }
    } catch (error: any) {
      add({
        level: 'warning',
        title: 'No se pudo validar la configuración de usuarios Control Escolar.',
        detail: normalize(error?.message) || 'Falló la lectura de la tabla externa users.',
        source: 'Destinatarios',
        code: normalize(error?.code || error?.name) || undefined,
        action: 'Valida la conexión externa y que exista la tabla users.'
      })
    }
  }

  const previousStatus = Number(query.statusCode || query.status || 0)
  if (previousStatus >= 500 && !diagnostics.some(item => item.level === 'error')) {
    add({
      level: 'error',
      title: `El endpoint de preview devolvió HTTP ${previousStatus} antes de entregar diagnóstico específico.`,
      detail: 'El servidor llegó al endpoint de diagnóstico, pero la llamada original falló en una capa anterior o en una versión anterior del backend.',
      statusCode: previousStatus,
      source: normalize(query.stage) || 'POST /api/no-adeudo/preview',
      code: 'NO_ADEUDO_PREVIEW_HTTP_' + previousStatus,
      action: 'Despliega esta versión y reinicia el proceso de Nuxt. Esta versión omite ensureSchema para /api/no-adeudo/* y devuelve diagnóstico estructurado desde el handler.'
    })
  }

  const primary = diagnostics.find(item => item.level === 'error') || diagnostics[0] || null
  return {
    ok: !diagnostics.some(item => item.level === 'error'),
    diagnostic: primary,
    diagnostics,
    checks,
    context: {
      transport,
      bridgeAgentId: requestAgent || configuredAgent || '',
      stage: normalize(query.stage),
      previousStatus: previousStatus || null
    }
  }
})
