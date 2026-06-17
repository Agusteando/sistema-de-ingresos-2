declare global {
  const ACTIVE_SYNC_STATUSES: typeof import('../../server/utils/externalBaseSync').ACTIVE_SYNC_STATUSES
  const BECA_TYPE_OPTIONS: typeof import('../../server/utils/becaTypes').BECA_TYPE_OPTIONS
  const BRIDGE_AGENT_UNAVAILABLE_MESSAGE: typeof import('../../server/utils/db').BRIDGE_AGENT_UNAVAILABLE_MESSAGE
  const CONCEPTO_CATEGORIES: typeof import('../../server/utils/conceptos-config').CONCEPTO_CATEGORIES
  const CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS: typeof import('../../server/utils/control-escolar').CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS
  const CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS: typeof import('../../server/utils/control-escolar').CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS
  const CONTROL_ESCOLAR_ROLE: typeof import('../../server/utils/auth-session').CONTROL_ESCOLAR_ROLE
  const DEFAULT_COBRANZA_EMAIL_SUBJECT: typeof import('../../server/utils/cobranzaEmail').DEFAULT_COBRANZA_EMAIL_SUBJECT
  const DEFAULT_COBRANZA_EMAIL_TEMPLATE: typeof import('../../server/utils/cobranzaEmail').DEFAULT_COBRANZA_EMAIL_TEMPLATE
  const DEFAULT_PLANTELES: typeof import('../../server/utils/conceptos-config').DEFAULT_PLANTELES
  const ENROLLMENT_CONFIG_TIMEOUT_MS: typeof import('../../server/utils/externalBaseSync').ENROLLMENT_CONFIG_TIMEOUT_MS
  const ENROLLMENT_CONFIG_URL: typeof import('../../server/utils/externalBaseSync').ENROLLMENT_CONFIG_URL
  const EXTERNAL_SYNC_BATCH_LIMIT: typeof import('../../server/utils/externalBaseSync').EXTERNAL_SYNC_BATCH_LIMIT
  const EXTERNAL_SYNC_STALE_AFTER_MINUTES: typeof import('../../server/utils/externalBaseSync').EXTERNAL_SYNC_STALE_AFTER_MINUTES
  const EXTERNAL_SYNC_TIMEOUT_MS: typeof import('../../server/utils/externalBaseSync').EXTERNAL_SYNC_TIMEOUT_MS
  const EXTERNAL_SYNC_URL: typeof import('../../server/utils/externalBaseSync').EXTERNAL_SYNC_URL
  const FINANCIAL_ADMIN_ROLE: typeof import('../../server/utils/auth-session').FINANCIAL_ADMIN_ROLE
  const H3Error: typeof import('../../node_modules/h3').H3Error
  const H3Event: typeof import('../../node_modules/h3').H3Event
  const LOCAL_SYSTEM_BRIDGE_COMMAND: typeof import('../../server/utils/local-system-handoff').LOCAL_SYSTEM_BRIDGE_COMMAND
  const LOG_PREFIX: typeof import('../../server/utils/externalBaseSync').LOG_PREFIX
  const NO_ADEUDO_CONTROL_PLANTELES_COLUMN: typeof import('../../server/utils/external-users').NO_ADEUDO_CONTROL_PLANTELES_COLUMN
  const WORKSPACE_DIRECTORY_SCOPE: typeof import('../../server/utils/google-workspace-directory').WORKSPACE_DIRECTORY_SCOPE
  const WORKSPACE_DOMAIN: typeof import('../../server/utils/google-workspace-directory').WORKSPACE_DOMAIN
  const __buildAssetsURL: typeof import('../../node_modules/@nuxt/nitro-server/dist/runtime/utils/paths').buildAssetsURL
  const __publicAssetsURL: typeof import('../../node_modules/@nuxt/nitro-server/dist/runtime/utils/paths').publicAssetsURL
  const appendConceptMappedServicioToMatricula: typeof import('../../server/utils/talleres-servicios').appendConceptMappedServicioToMatricula
  const appendCorsHeaders: typeof import('../../node_modules/h3').appendCorsHeaders
  const appendCorsPreflightHeaders: typeof import('../../node_modules/h3').appendCorsPreflightHeaders
  const appendHeader: typeof import('../../node_modules/h3').appendHeader
  const appendHeaders: typeof import('../../node_modules/h3').appendHeaders
  const appendResponseHeader: typeof import('../../node_modules/h3').appendResponseHeader
  const appendResponseHeaders: typeof import('../../node_modules/h3').appendResponseHeaders
  const assertAuroraExternalApiToken: typeof import('../../server/utils/external-api-auth').assertAuroraExternalApiToken
  const assertControlEscolarDynamicBridge: typeof import('../../server/utils/control-escolar').assertControlEscolarDynamicBridge
  const assertDocumentoPeriodoLifecycleSchema: typeof import('../../server/utils/documento-periods').assertDocumentoPeriodoLifecycleSchema
  const assertMethod: typeof import('../../node_modules/h3').assertMethod
  const attachCustomSectionsToStudents: typeof import('../../server/utils/student-sections').attachCustomSectionsToStudents
  const attachRowSignatures: typeof import('../../server/utils/externalBaseSync').attachRowSignatures
  const authCookieOptions: typeof import('../../server/utils/auth-cookie-options').authCookieOptions
  const buildConceptosConfigPayload: typeof import('../../server/utils/conceptos-config').buildConceptosConfigPayload
  const buildControlEscolarScopeDescriptor: typeof import('../../server/utils/control-escolar-cache').buildControlEscolarScopeDescriptor
  const buildExternalControlEscolarScope: typeof import('../../server/utils/control-escolar-external-view').buildExternalControlEscolarScope
  const buildExternalHeaders: typeof import('../../server/utils/externalBaseSync').buildExternalHeaders
  const buildExternalUrl: typeof import('../../server/utils/externalBaseSync').buildExternalUrl
  const buildNoAdeudoPreviewPayload: typeof import('../../server/utils/noAdeudo').buildNoAdeudoPreviewPayload
  const buildNoAdeudoValidationUrl: typeof import('../../server/utils/noAdeudo').buildNoAdeudoValidationUrl
  const buildWorkspacePhotoUrl: typeof import('../../server/utils/google-workspace-directory').buildWorkspacePhotoUrl
  const bulkUpdateExternalUsers: typeof import('../../server/utils/external-users').bulkUpdateExternalUsers
  const cachedEventHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').cachedEventHandler
  const cachedFunction: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').cachedFunction
  const calculateNoAdeudoDebt: typeof import('../../server/utils/noAdeudo').calculateNoAdeudoDebt
  const callNodeListener: typeof import('../../node_modules/h3').callNodeListener
  const canManageConceptosConfig: typeof import('../../server/utils/conceptos-config').canManageConceptosConfig
  const centralTableHasColumn: typeof import('../../server/utils/control-escolar-central').centralTableHasColumn
  const checkBridgeAgentAvailability: typeof import('../../server/utils/db').checkBridgeAgentAvailability
  const cleanApiKey: typeof import('../../server/utils/externalBaseSync').cleanApiKey
  const cleanupBlockingRuns: typeof import('../../server/utils/externalBaseSync').cleanupBlockingRuns
  const clearImpersonationCookies: typeof import('../../server/utils/impersonation-session').clearImpersonationCookies
  const clearResponseHeaders: typeof import('../../node_modules/h3').clearResponseHeaders
  const clearSession: typeof import('../../node_modules/h3').clearSession
  const collectServiceCatalog: typeof import('../../server/utils/conceptos-config').collectServiceCatalog
  const collectUnassociatedServices: typeof import('../../server/utils/conceptos-config').collectUnassociatedServices
  const computeHash: typeof import('../../server/utils/externalBaseSync').computeHash
  const controlEscolarCentralQuery: typeof import('../../server/utils/control-escolar-central').controlEscolarCentralQuery
  const createApp: typeof import('../../node_modules/h3').createApp
  const createAppEventHandler: typeof import('../../node_modules/h3').createAppEventHandler
  const createEmptyCounters: typeof import('../../server/utils/externalBaseSync').createEmptyCounters
  const createError: typeof import('../../node_modules/h3').createError
  const createEvent: typeof import('../../node_modules/h3').createEvent
  const createEventStream: typeof import('../../node_modules/h3').createEventStream
  const createExternalUser: typeof import('../../server/utils/external-users').createExternalUser
  const createImpersonationToken: typeof import('../../server/utils/impersonation-session').createImpersonationToken
  const createNoAdeudoToken: typeof import('../../server/utils/noAdeudo').createNoAdeudoToken
  const createOrUpdateMapping: typeof import('../../server/utils/conceptos-config').createOrUpdateMapping
  const createRouter: typeof import('../../node_modules/h3').createRouter
  const createXlsxWorkbook: typeof import('../../server/utils/xlsx').createXlsxWorkbook
  const decodeNoAdeudoToken: typeof import('../../server/utils/noAdeudo').decodeNoAdeudoToken
  const defaultContentType: typeof import('../../node_modules/h3').defaultContentType
  const defineAppConfig: typeof import('../../node_modules/@nuxt/nitro-server/dist/runtime/utils/config').defineAppConfig
  const defineCachedEventHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedEventHandler
  const defineCachedFunction: typeof import('../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedFunction
  const defineEventHandler: typeof import('../../node_modules/h3').defineEventHandler
  const defineLazyEventHandler: typeof import('../../node_modules/h3').defineLazyEventHandler
  const defineNitroErrorHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/error/utils').defineNitroErrorHandler
  const defineNitroPlugin: typeof import('../../node_modules/nitropack/dist/runtime/internal/plugin').defineNitroPlugin
  const defineNodeListener: typeof import('../../node_modules/h3').defineNodeListener
  const defineNodeMiddleware: typeof import('../../node_modules/h3').defineNodeMiddleware
  const defineRenderHandler: typeof import('../../node_modules/nitropack/dist/runtime/internal/renderer').defineRenderHandler
  const defineRequestMiddleware: typeof import('../../node_modules/h3').defineRequestMiddleware
  const defineResponseMiddleware: typeof import('../../node_modules/h3').defineResponseMiddleware
  const defineRouteMeta: typeof import('../../node_modules/nitropack/dist/runtime/internal/meta').defineRouteMeta
  const defineTask: typeof import('../../node_modules/nitropack/dist/runtime/internal/task').defineTask
  const defineWebSocket: typeof import('../../node_modules/h3').defineWebSocket
  const defineWebSocketHandler: typeof import('../../node_modules/h3').defineWebSocketHandler
  const deleteCookie: typeof import('../../node_modules/h3').deleteCookie
  const deleteCycle: typeof import('../../server/utils/conceptos-config').deleteCycle
  const deleteExternalUser: typeof import('../../server/utils/external-users').deleteExternalUser
  const deleteMapping: typeof import('../../server/utils/conceptos-config').deleteMapping
  const detachAndVerifySignedRow: typeof import('../../server/utils/externalBaseSync').detachAndVerifySignedRow
  const diagnoseNoAdeudoError: typeof import('../../server/utils/noAdeudo').diagnoseNoAdeudoError
  const dynamicEventHandler: typeof import('../../node_modules/h3').dynamicEventHandler
  const ensureControlBaseSource: typeof import('../../server/utils/control-escolar-cache').ensureControlBaseSource
  const ensureControlEscolarCacheSchema: typeof import('../../server/utils/control-escolar-cache').ensureControlEscolarCacheSchema
  const ensureControlEscolarExternalViewSchema: typeof import('../../server/utils/control-escolar-external-view').ensureControlEscolarExternalViewSchema
  const ensureExternalUsersTable: typeof import('../../server/utils/external-users').ensureExternalUsersTable
  const ensureSchema: typeof import('../../server/utils/db').ensureSchema
  const enterBridgeAgentId: typeof import('../../server/utils/db').enterBridgeAgentId
  const escapeHtml: typeof import('../../server/utils/cobranzaEmail').escapeHtml
  const eventHandler: typeof import('../../node_modules/h3').eventHandler
  const executeStatementTransaction: typeof import('../../server/utils/db').executeStatementTransaction
  const executeTransaction: typeof import('../../server/utils/db').executeTransaction
  const externalUserAccessMode: typeof import('../../server/utils/external-users').externalUserAccessMode
  const extractExternalRows: typeof import('../../server/utils/externalBaseSync').extractExternalRows
  const fetchCentralMatriculaOverlay: typeof import('../../server/utils/central-matricula-overlay').fetchCentralMatriculaOverlay
  const fetchCentralMatriculaOverlays: typeof import('../../server/utils/central-matricula-overlay').fetchCentralMatriculaOverlays
  const fetchControlEscolarExportRows: typeof import('../../server/utils/control-escolar').fetchControlEscolarExportRows
  const fetchControlEscolarKpis: typeof import('../../server/utils/control-escolar').fetchControlEscolarKpis
  const fetchControlEscolarSiblingsByParentNames: typeof import('../../server/utils/control-escolar').fetchControlEscolarSiblingsByParentNames
  const fetchControlEscolarStudentDetail: typeof import('../../server/utils/control-escolar').fetchControlEscolarStudentDetail
  const fetchControlEscolarStudents: typeof import('../../server/utils/control-escolar').fetchControlEscolarStudents
  const fetchCurrentEnrollmentCicloKey: typeof import('../../server/utils/externalBaseSync').fetchCurrentEnrollmentCicloKey
  const fetchExternalRows: typeof import('../../server/utils/externalBaseSync').fetchExternalRows
  const fetchVerifiedControlEscolarScopeRows: typeof import('../../server/utils/control-escolar-cache').fetchVerifiedControlEscolarScopeRows
  const fetchWithEvent: typeof import('../../node_modules/h3').fetchWithEvent
  const findExternalUserByEmail: typeof import('../../server/utils/external-users').findExternalUserByEmail
  const findTallerServicioForConcept: typeof import('../../server/utils/talleres-servicios').findTallerServicioForConcept
  const finishRun: typeof import('../../server/utils/externalBaseSync').finishRun
  const formatCobranzaMoney: typeof import('../../server/utils/cobranzaEmail').formatCobranzaMoney
  const formatTipoIngresoValue: typeof import('../../shared/utils/tipoIngreso').formatTipoIngresoValue
  const fromNodeMiddleware: typeof import('../../node_modules/h3').fromNodeMiddleware
  const fromPlainHandler: typeof import('../../node_modules/h3').fromPlainHandler
  const fromWebHandler: typeof import('../../node_modules/h3').fromWebHandler
  const generateBecaCartaPdf: typeof import('../../server/utils/becaCartaPdf').generateBecaCartaPdf
  const generateNoAdeudoCartaPdf: typeof import('../../server/utils/noAdeudoCartaPdf').generateNoAdeudoCartaPdf
  const generateNoAdeudoPdfForContext: typeof import('../../server/utils/noAdeudo').generateNoAdeudoPdfForContext
  const generateQrMatrix: typeof import('../../server/utils/qr').generateQrMatrix
  const getAdminProfilePhoto: typeof import('../../server/utils/googleAdmin').getAdminProfilePhoto
  const getAuroraExternalApiAuthDiagnostics: typeof import('../../server/utils/external-api-auth').getAuroraExternalApiAuthDiagnostics
  const getAuroraExternalApiRequestAuthDiagnostics: typeof import('../../server/utils/external-api-auth').getAuroraExternalApiRequestAuthDiagnostics
  const getBridgeAgentId: typeof import('../../server/utils/db').getBridgeAgentId
  const getCentralTableColumns: typeof import('../../server/utils/control-escolar-central').getCentralTableColumns
  const getControlBaseSourceId: typeof import('../../server/utils/control-escolar-cache').getControlBaseSourceId
  const getControlEscolarAuditSummary: typeof import('../../server/utils/control-escolar-audit').getControlEscolarAuditSummary
  const getControlEscolarCentralDb: typeof import('../../server/utils/control-escolar-central').getControlEscolarCentralDb
  const getControlEscolarSchema: typeof import('../../server/utils/control-escolar').getControlEscolarSchema
  const getCookie: typeof import('../../node_modules/h3').getCookie
  const getDb: typeof import('../../server/utils/db').getDb
  const getDbTransport: typeof import('../../server/utils/db').getDbTransport
  const getDeudoresColeg: typeof import('../../server/utils/deudores').getDeudoresColeg
  const getDeudoresGlobal: typeof import('../../server/utils/deudores').getDeudoresGlobal
  const getDocumentoPeriodoSchema: typeof import('../../server/utils/documento-periods').getDocumentoPeriodoSchema
  const getExternalStudentPlanteles: typeof import('../../server/utils/control-escolar-external-view').getExternalStudentPlanteles
  const getExternalSyncConfig: typeof import('../../server/utils/externalBaseSync').getExternalSyncConfig
  const getExternalUsersColumns: typeof import('../../server/utils/external-users').getExternalUsersColumns
  const getExternalUsersDiagnostics: typeof import('../../server/utils/external-users').getExternalUsersDiagnostics
  const getHeader: typeof import('../../node_modules/h3').getHeader
  const getHeaders: typeof import('../../node_modules/h3').getHeaders
  const getHistoricalEnrollmentConceptEvidence: typeof import('../../server/utils/enrollment-evidence').getHistoricalEnrollmentConceptEvidence
  const getMethod: typeof import('../../node_modules/h3').getMethod
  const getNoAdeudoControlUserForPlantel: typeof import('../../server/utils/external-users').getNoAdeudoControlUserForPlantel
  const getNoAdeudoSettings: typeof import('../../server/utils/noAdeudo').getNoAdeudoSettings
  const getProxyRequestHeaders: typeof import('../../node_modules/h3').getProxyRequestHeaders
  const getQuery: typeof import('../../node_modules/h3').getQuery
  const getRequestFingerprint: typeof import('../../node_modules/h3').getRequestFingerprint
  const getRequestHeader: typeof import('../../node_modules/h3').getRequestHeader
  const getRequestHeaders: typeof import('../../node_modules/h3').getRequestHeaders
  const getRequestHost: typeof import('../../node_modules/h3').getRequestHost
  const getRequestIP: typeof import('../../node_modules/h3').getRequestIP
  const getRequestPath: typeof import('../../node_modules/h3').getRequestPath
  const getRequestProtocol: typeof import('../../node_modules/h3').getRequestProtocol
  const getRequestURL: typeof import('../../node_modules/h3').getRequestURL
  const getRequestWebStream: typeof import('../../node_modules/h3').getRequestWebStream
  const getResponseHeader: typeof import('../../node_modules/h3').getResponseHeader
  const getResponseHeaders: typeof import('../../node_modules/h3').getResponseHeaders
  const getResponseStatus: typeof import('../../node_modules/h3').getResponseStatus
  const getResponseStatusText: typeof import('../../node_modules/h3').getResponseStatusText
  const getRouteRules: typeof import('../../node_modules/nitropack/dist/runtime/internal/route-rules').getRouteRules
  const getRouterParam: typeof import('../../node_modules/h3').getRouterParam
  const getRouterParams: typeof import('../../node_modules/h3').getRouterParams
  const getSession: typeof import('../../node_modules/h3').getSession
  const getSuperAdminPlanteles: typeof import('../../server/utils/auth-session').getSuperAdminPlanteles
  const getTrustedAuthUser: typeof import('../../server/utils/auth-session').getTrustedAuthUser
  const getValidatedQuery: typeof import('../../node_modules/h3').getValidatedQuery
  const getValidatedRouterParams: typeof import('../../node_modules/h3').getValidatedRouterParams
  const getWorkspaceDirectoryPhoto: typeof import('../../server/utils/google-workspace-directory').getWorkspaceDirectoryPhoto
  const getWorkspaceDirectoryService: typeof import('../../server/utils/google-workspace-directory').getWorkspaceDirectoryService
  const getWorkspaceDirectoryUsersByEmails: typeof import('../../server/utils/google-workspace-directory').getWorkspaceDirectoryUsersByEmails
  const handleCacheHeaders: typeof import('../../node_modules/h3').handleCacheHeaders
  const handleCors: typeof import('../../node_modules/h3').handleCors
  const hasControlEscolarRole: typeof import('../../server/utils/auth-session').hasControlEscolarRole
  const hasExternalControlRole: typeof import('../../server/utils/external-users').hasExternalControlRole
  const hasFinancialAccessForPlantel: typeof import('../../server/utils/auth-session').hasFinancialAccessForPlantel
  const hasFinancialAdminRole: typeof import('../../server/utils/auth-session').hasFinancialAdminRole
  const hasRole: typeof import('../../server/utils/auth-session').hasRole
  const impersonatedAuthCookieOptions: typeof import('../../server/utils/impersonation-session').impersonatedAuthCookieOptions
  const impersonationCookieOptions: typeof import('../../server/utils/impersonation-session').impersonationCookieOptions
  const impersonationSecondsRemaining: typeof import('../../server/utils/impersonation-session').impersonationSecondsRemaining
  const importControlEscolarMatriculaUpdates: typeof import('../../server/utils/control-escolar').importControlEscolarMatriculaUpdates
  const isBridgeAgentUnavailableError: typeof import('../../server/utils/db').isBridgeAgentUnavailableError
  const isCasitaWorkspaceEmail: typeof import('../../server/utils/google-workspace-directory').isCasitaWorkspaceEmail
  const isControlEscolarOnlyRole: typeof import('../../server/utils/auth-session').isControlEscolarOnlyRole
  const isCorsOriginAllowed: typeof import('../../node_modules/h3').isCorsOriginAllowed
  const isDepuradoPayment: typeof import('../../server/utils/payment-classification').isDepuradoPayment
  const isError: typeof import('../../node_modules/h3').isError
  const isEvent: typeof import('../../node_modules/h3').isEvent
  const isEventHandler: typeof import('../../node_modules/h3').isEventHandler
  const isExternalUsersAvailable: typeof import('../../server/utils/external-users').isExternalUsersAvailable
  const isLocalSystemRuntime: typeof import('../../server/utils/local-system-manager').isLocalSystemRuntime
  const isMethod: typeof import('../../node_modules/h3').isMethod
  const isOtherCampusPayment: typeof import('../../server/utils/payment-classification').isOtherCampusPayment
  const isPreflightRequest: typeof import('../../node_modules/h3').isPreflightRequest
  const isRunCancelled: typeof import('../../server/utils/externalBaseSync').isRunCancelled
  const isScopedToActivePlantel: typeof import('../../server/utils/student-sections').isScopedToActivePlantel
  const isStream: typeof import('../../node_modules/h3').isStream
  const isSuperAdminRole: typeof import('../../server/utils/auth-session').isSuperAdminRole
  const isValidPlantelScope: typeof import('../../server/utils/auth-session').isValidPlantelScope
  const isWebResponse: typeof import('../../node_modules/h3').isWebResponse
  const isWholeMoney: typeof import('../../server/utils/monto-final').isWholeMoney
  const lazyEventHandler: typeof import('../../node_modules/h3').lazyEventHandler
  const legacyProjectedAmount: typeof import('../../server/utils/monto-final').legacyProjectedAmount
  const listControlEscolarPlanteles: typeof import('../../server/utils/control-escolar').listControlEscolarPlanteles
  const listExternalControlUsersForNoAdeudo: typeof import('../../server/utils/external-users').listExternalControlUsersForNoAdeudo
  const listExternalUsers: typeof import('../../server/utils/external-users').listExternalUsers
  const logControlEscolarAuditEvent: typeof import('../../server/utils/control-escolar-audit').logControlEscolarAuditEvent
  const logSyncError: typeof import('../../server/utils/externalBaseSync').logSyncError
  const logSyncInfo: typeof import('../../server/utils/externalBaseSync').logSyncInfo
  const logSyncWarn: typeof import('../../server/utils/externalBaseSync').logSyncWarn
  const mapExternalRow: typeof import('../../server/utils/externalBaseSync').mapExternalRow
  const markRunStatus: typeof import('../../server/utils/externalBaseSync').markRunStatus
  const maybePublishControlEscolarSnapshotFromBridge: typeof import('../../server/utils/control-escolar-cache').maybePublishControlEscolarSnapshotFromBridge
  const maybeRefreshControlEscolarCacheFromLoadedRows: typeof import('../../server/utils/control-escolar-cache').maybeRefreshControlEscolarCacheFromLoadedRows
  const maybeRefreshVerifiedControlEscolarScopeCache: typeof import('../../server/utils/control-escolar-cache').maybeRefreshVerifiedControlEscolarScopeCache
  const minimumFractionDigits: typeof import('../../server/utils/cobranzaEmail').minimumFractionDigits
  const nextCicloKey: typeof import('../../shared/utils/tipoIngreso').nextCicloKey
  const nitroPlugin: typeof import('../../node_modules/nitropack/dist/runtime/internal/plugin').nitroPlugin
  const noAdeudoControlUsersColumnExists: typeof import('../../server/utils/external-users').noAdeudoControlUsersColumnExists
  const normalizeAuthRole: typeof import('../../server/utils/auth-session').normalizeAuthRole
  const normalizeBecaTypes: typeof import('../../server/utils/becaTypes').normalizeBecaTypes
  const normalizeCicloForTipoIngreso: typeof import('../../shared/utils/tipoIngreso').normalizeCicloForTipoIngreso
  const normalizeMatricula: typeof import('../../server/utils/externalBaseSync').normalizeMatricula
  const normalizePaymentMethod: typeof import('../../server/utils/payment-classification').normalizePaymentMethod
  const normalizePlantel: typeof import('../../server/utils/auth-session').normalizePlantel
  const normalizeTemplateInput: typeof import('../../server/utils/cobranzaEmail').normalizeTemplateInput
  const numeroALetras: typeof import('../../server/utils/numberToWords').numeroALetras
  const parseCookies: typeof import('../../node_modules/h3').parseCookies
  const parseEnrollmentConceptIds: typeof import('../../server/utils/enrollment-evidence').parseEnrollmentConceptIds
  const parseNullableMoney: typeof import('../../server/utils/monto-final').parseNullableMoney
  const parsePlanteles: typeof import('../../server/utils/auth-session').parsePlanteles
  const parseRoles: typeof import('../../server/utils/auth-session').parseRoles
  const periodoLifecycleSelect: typeof import('../../server/utils/documento-periods').periodoLifecycleSelect
  const persistNoAdeudoDeudorCartaMark: typeof import('../../server/utils/noAdeudo').persistNoAdeudoDeudorCartaMark
  const previousCicloKey: typeof import('../../shared/utils/tipoIngreso').previousCicloKey
  const processExternalRowsBatch: typeof import('../../server/utils/externalBaseSync').processExternalRowsBatch
  const promisifyNodeListener: typeof import('../../node_modules/h3').promisifyNodeListener
  const proxyCfdiEvent: typeof import('../../server/utils/cfdi-proxy').proxyCfdiEvent
  const proxyRequest: typeof import('../../node_modules/h3').proxyRequest
  const publishControlEscolarSnapshotFromBridge: typeof import('../../server/utils/control-escolar-cache').publishControlEscolarSnapshotFromBridge
  const query: typeof import('../../server/utils/db').query
  const queryExternalUsers: typeof import('../../server/utils/external-users').queryExternalUsers
  const readBestConceptosConfig: typeof import('../../server/utils/conceptos-config').readBestConceptosConfig
  const readBestConceptosConfigPayload: typeof import('../../server/utils/conceptos-config').readBestConceptosConfigPayload
  const readBestTalleresServiciosCatalog: typeof import('../../server/utils/talleres-servicios').readBestTalleresServiciosCatalog
  const readBody: typeof import('../../node_modules/h3').readBody
  const readCentralConceptos: typeof import('../../server/utils/conceptos-config').readCentralConceptos
  const readCentralConceptosConfig: typeof import('../../server/utils/conceptos-config').readCentralConceptosConfig
  const readCentralMatriculaServicios: typeof import('../../server/utils/talleres-servicios').readCentralMatriculaServicios
  const readCentralTalleresServiciosCatalog: typeof import('../../server/utils/talleres-servicios').readCentralTalleresServiciosCatalog
  const readControlCacheSourceMeta: typeof import('../../server/utils/control-escolar-cache').readControlCacheSourceMeta
  const readExternalControlEscolarChanges: typeof import('../../server/utils/control-escolar-external-view').readExternalControlEscolarChanges
  const readExternalControlEscolarHealth: typeof import('../../server/utils/control-escolar-external-view').readExternalControlEscolarHealth
  const readExternalControlEscolarStudentDetail: typeof import('../../server/utils/control-escolar-external-view').readExternalControlEscolarStudentDetail
  const readExternalControlEscolarStudents: typeof import('../../server/utils/control-escolar-external-view').readExternalControlEscolarStudents
  const readExternalDeudorStatus: typeof import('../../server/utils/external-deudores').readExternalDeudorStatus
  const readExternalErrorBody: typeof import('../../server/utils/externalBaseSync').readExternalErrorBody
  const readFormData: typeof import('../../node_modules/h3').readFormData
  const readLocalConceptosConfig: typeof import('../../server/utils/conceptos-config').readLocalConceptosConfig
  const readLocalTalleresServiciosCatalog: typeof import('../../server/utils/talleres-servicios').readLocalTalleresServiciosCatalog
  const readMultipartFormData: typeof import('../../node_modules/h3').readMultipartFormData
  const readRawBody: typeof import('../../node_modules/h3').readRawBody
  const readSyncRun: typeof import('../../server/utils/externalBaseSync').readSyncRun
  const readValidatedBody: typeof import('../../node_modules/h3').readValidatedBody
  const refreshVerifiedControlEscolarCacheForScope: typeof import('../../server/utils/control-escolar').refreshVerifiedControlEscolarCacheForScope
  const removeResponseHeader: typeof import('../../node_modules/h3').removeResponseHeader
  const renderCobranzaEmail: typeof import('../../server/utils/cobranzaEmail').renderCobranzaEmail
  const renderNoAdeudoEmail: typeof import('../../server/utils/noAdeudo').renderNoAdeudoEmail
  const requestLocalSystemManager: typeof import('../../server/utils/local-system-manager').requestLocalSystemManager
  const requireConceptosAdmin: typeof import('../../server/utils/conceptos-config').requireConceptosAdmin
  const resolveCfdiPath: typeof import('../../server/utils/cfdi-proxy').resolveCfdiPath
  const resolveControlEscolarAuth: typeof import('../../server/utils/control-escolar').resolveControlEscolarAuth
  const resolveDataBridgeAgentId: typeof import('../../server/utils/auth-session').resolveDataBridgeAgentId
  const resolveFinalEstatus: typeof import('../../server/utils/externalBaseSync').resolveFinalEstatus
  const resolveNoAdeudoStudentContext: typeof import('../../server/utils/noAdeudo').resolveNoAdeudoStudentContext
  const resolveNoAdeudoVerifyBaseUrl: typeof import('../../server/utils/noAdeudo').resolveNoAdeudoVerifyBaseUrl
  const resolvePaymentConceptSnapshot: typeof import('../../server/utils/payment-concept').resolvePaymentConceptSnapshot
  const resolveProjectedAmount: typeof import('../../server/utils/monto-final').resolveProjectedAmount
  const resolveServiciosWithCatalog: typeof import('../../server/utils/talleres-servicios').resolveServiciosWithCatalog
  const resolveTipoIngreso: typeof import('../../shared/utils/tipoIngreso').resolveTipoIngreso
  const runControlEscolar: typeof import('../../server/utils/control-escolar').runControlEscolar
  const runRawSqlStatement: typeof import('../../server/utils/db').runRawSqlStatement
  const runSyncForActiveBridge: typeof import('../../server/utils/conceptos-config').runSyncForActiveBridge
  const runTask: typeof import('../../node_modules/nitropack/dist/runtime/internal/task').runTask
  const runWithBridgeAgentId: typeof import('../../server/utils/db').runWithBridgeAgentId
  const safeErrorMessage: typeof import('../../server/utils/externalBaseSync').safeErrorMessage
  const sanitizeStatusCode: typeof import('../../node_modules/h3').sanitizeStatusCode
  const sanitizeStatusMessage: typeof import('../../node_modules/h3').sanitizeStatusMessage
  const saveCycle: typeof import('../../server/utils/conceptos-config').saveCycle
  const sealSession: typeof import('../../node_modules/h3').sealSession
  const searchWorkspaceDirectoryUsers: typeof import('../../server/utils/google-workspace-directory').searchWorkspaceDirectoryUsers
  const selectNoAdeudoRecipients: typeof import('../../server/utils/noAdeudo').selectNoAdeudoRecipients
  const send: typeof import('../../node_modules/h3').send
  const sendEmail: typeof import('../../server/utils/mailer').sendEmail
  const sendError: typeof import('../../node_modules/h3').sendError
  const sendIterable: typeof import('../../node_modules/h3').sendIterable
  const sendNoAdeudoForContext: typeof import('../../server/utils/noAdeudo').sendNoAdeudoForContext
  const sendNoContent: typeof import('../../node_modules/h3').sendNoContent
  const sendProxy: typeof import('../../node_modules/h3').sendProxy
  const sendRedirect: typeof import('../../node_modules/h3').sendRedirect
  const sendStream: typeof import('../../node_modules/h3').sendStream
  const sendWebResponse: typeof import('../../node_modules/h3').sendWebResponse
  const serializeServicios: typeof import('../../server/utils/talleres-servicios').serializeServicios
  const serveStatic: typeof import('../../node_modules/h3').serveStatic
  const setCookie: typeof import('../../node_modules/h3').setCookie
  const setExternalApiResponseHeaders: typeof import('../../server/utils/external-api-auth').setExternalApiResponseHeaders
  const setHeader: typeof import('../../node_modules/h3').setHeader
  const setHeaders: typeof import('../../node_modules/h3').setHeaders
  const setNoAdeudoControlUserForPlantel: typeof import('../../server/utils/external-users').setNoAdeudoControlUserForPlantel
  const setResponseHeader: typeof import('../../node_modules/h3').setResponseHeader
  const setResponseHeaders: typeof import('../../node_modules/h3').setResponseHeaders
  const setResponseStatus: typeof import('../../node_modules/h3').setResponseStatus
  const signExternalRow: typeof import('../../server/utils/externalBaseSync').signExternalRow
  const splitCookiesString: typeof import('../../node_modules/h3').splitCookiesString
  const syncCentralConceptosConfigToBridge: typeof import('../../server/utils/conceptos-config').syncCentralConceptosConfigToBridge
  const syncCentralConceptosConfigToBridgeBestEffort: typeof import('../../server/utils/conceptos-config').syncCentralConceptosConfigToBridgeBestEffort
  const syncCentralTalleresServiciosCatalogToBridge: typeof import('../../server/utils/talleres-servicios').syncCentralTalleresServiciosCatalogToBridge
  const throwNoAdeudoDiagnosticError: typeof import('../../server/utils/noAdeudo').throwNoAdeudoDiagnosticError
  const toEventHandler: typeof import('../../node_modules/h3').toEventHandler
  const toNodeListener: typeof import('../../node_modules/h3').toNodeListener
  const toPlainHandler: typeof import('../../node_modules/h3').toPlainHandler
  const toStatusPayload: typeof import('../../server/utils/externalBaseSync').toStatusPayload
  const toWebHandler: typeof import('../../node_modules/h3').toWebHandler
  const toWebRequest: typeof import('../../node_modules/h3').toWebRequest
  const touchExternalUserLogin: typeof import('../../server/utils/external-users').touchExternalUserLogin
  const unsealSession: typeof import('../../node_modules/h3').unsealSession
  const unwrapLocalSystemBridgeResult: typeof import('../../server/utils/local-system-handoff').unwrapLocalSystemBridgeResult
  const updateCentralMatriculaServicio: typeof import('../../server/utils/talleres-servicios').updateCentralMatriculaServicio
  const updateControlEscolarStudent: typeof import('../../server/utils/control-escolar').updateControlEscolarStudent
  const updateExternalUser: typeof import('../../server/utils/external-users').updateExternalUser
  const updateRunProgress: typeof import('../../server/utils/externalBaseSync').updateRunProgress
  const updateSession: typeof import('../../node_modules/h3').updateSession
  const useAppConfig: typeof import('../../node_modules/nitropack/dist/runtime/internal/config').useAppConfig
  const useBase: typeof import('../../node_modules/h3').useBase
  const useEvent: typeof import('../../node_modules/nitropack/dist/runtime/internal/context').useEvent
  const useNitroApp: typeof import('../../node_modules/nitropack/dist/runtime/internal/app').useNitroApp
  const useRuntimeConfig: typeof import('../../node_modules/nitropack/dist/runtime/internal/config').useRuntimeConfig
  const useSecureAuthCookies: typeof import('../../server/utils/auth-cookie-options').useSecureAuthCookies
  const useSession: typeof import('../../node_modules/h3').useSession
  const useStorage: typeof import('../../node_modules/nitropack/dist/runtime/internal/storage').useStorage
  const verifyImpersonationToken: typeof import('../../server/utils/impersonation-session').verifyImpersonationToken
  const warmExternalControlEscolarStudentScope: typeof import('../../server/utils/control-escolar-external-view').warmExternalControlEscolarStudentScope
  const warmExternalControlEscolarStudentScopes: typeof import('../../server/utils/control-escolar-external-view').warmExternalControlEscolarStudentScopes
  const whatsappApi: typeof import('../../server/utils/whatsapp').whatsappApi
  const withControlEscolarCentralConnection: typeof import('../../server/utils/control-escolar-central').withControlEscolarCentralConnection
  const writeControlEscolarExternalStudentView: typeof import('../../server/utils/control-escolar-external-view').writeControlEscolarExternalStudentView
  const writeEarlyHints: typeof import('../../node_modules/h3').writeEarlyHints
}
// for type re-export
declare global {
  // @ts-ignore
  export type { EventHandler, EventHandlerRequest, EventHandlerResponse, EventHandlerObject, H3EventContext } from '../../node_modules/h3'
  import('../../node_modules/h3')
  // @ts-ignore
  export type { AuthRole, AuthSessionUser } from '../../server/utils/auth-session'
  import('../../server/utils/auth-session')
  // @ts-ignore
  export type { CobranzaEmailTemplateInput, CobranzaEmailRenderInput } from '../../server/utils/cobranzaEmail'
  import('../../server/utils/cobranzaEmail')
  // @ts-ignore
  export type { ConceptosConfigRow } from '../../server/utils/conceptos-config'
  import('../../server/utils/conceptos-config')
  // @ts-ignore
  export type { ControlEscolarAuditEventType } from '../../server/utils/control-escolar-audit'
  import('../../server/utils/control-escolar-audit')
  // @ts-ignore
  export type { ControlEscolarScopeDescriptor } from '../../server/utils/control-escolar-cache'
  import('../../server/utils/control-escolar-cache')
  // @ts-ignore
  export type { ControlEscolarStudentRow } from '../../server/utils/control-escolar'
  import('../../server/utils/control-escolar')
  // @ts-ignore
  export type { BridgeAgentAvailability, SqlStatement } from '../../server/utils/db'
  import('../../server/utils/db')
  // @ts-ignore
  export type { DocumentoPeriodoSchema } from '../../server/utils/documento-periods'
  import('../../server/utils/documento-periods')
  // @ts-ignore
  export type { SyncCounters, SyncRuntimeConfig } from '../../server/utils/externalBaseSync'
  import('../../server/utils/externalBaseSync')
  // @ts-ignore
  export type { ImpersonationSession } from '../../server/utils/impersonation-session'
  import('../../server/utils/impersonation-session')
  // @ts-ignore
  export type { LocalSystemBridgeResult } from '../../server/utils/local-system-handoff'
  import('../../server/utils/local-system-handoff')
  // @ts-ignore
  export type { MailAttachment } from '../../server/utils/mailer'
  import('../../server/utils/mailer')
  // @ts-ignore
  export type { NoAdeudoDeudorCartaMark, NoAdeudoStudentContext, NoAdeudoDiagnostic } from '../../server/utils/noAdeudo'
  import('../../server/utils/noAdeudo')
  // @ts-ignore
  export type { NoAdeudoCartaPdfInput } from '../../server/utils/noAdeudoCartaPdf'
  import('../../server/utils/noAdeudoCartaPdf')
  // @ts-ignore
  export type { PaymentConceptDocumentSource, PaymentConceptPeriodSource } from '../../server/utils/payment-concept'
  import('../../server/utils/payment-concept')
  // @ts-ignore
  export type { QrMatrix } from '../../server/utils/qr'
  import('../../server/utils/qr')
  // @ts-ignore
  export type { TipoIngresoValue, TipoIngresoSource, TipoIngresoResult, TipoIngresoResolverOptions } from '../../shared/utils/tipoIngreso'
  import('../../shared/utils/tipoIngreso')
  // @ts-ignore
  export type { TallerServicioCatalogRow } from '../../server/utils/talleres-servicios'
  import('../../server/utils/talleres-servicios')
}
export { H3Event, H3Error, appendCorsHeaders, appendCorsPreflightHeaders, appendHeader, appendHeaders, appendResponseHeader, appendResponseHeaders, assertMethod, callNodeListener, clearResponseHeaders, clearSession, createApp, createAppEventHandler, createError, createEvent, createEventStream, createRouter, defaultContentType, defineEventHandler, defineLazyEventHandler, defineNodeListener, defineNodeMiddleware, defineRequestMiddleware, defineResponseMiddleware, defineWebSocket, defineWebSocketHandler, deleteCookie, dynamicEventHandler, eventHandler, fetchWithEvent, fromNodeMiddleware, fromPlainHandler, fromWebHandler, getCookie, getHeader, getHeaders, getMethod, getProxyRequestHeaders, getQuery, getRequestFingerprint, getRequestHeader, getRequestHeaders, getRequestHost, getRequestIP, getRequestPath, getRequestProtocol, getRequestURL, getRequestWebStream, getResponseHeader, getResponseHeaders, getResponseStatus, getResponseStatusText, getRouterParam, getRouterParams, getSession, getValidatedQuery, getValidatedRouterParams, handleCacheHeaders, handleCors, isCorsOriginAllowed, isError, isEvent, isEventHandler, isMethod, isPreflightRequest, isStream, isWebResponse, lazyEventHandler, parseCookies, promisifyNodeListener, proxyRequest, readBody, readFormData, readMultipartFormData, readRawBody, readValidatedBody, removeResponseHeader, sanitizeStatusCode, sanitizeStatusMessage, sealSession, send, sendError, sendIterable, sendNoContent, sendProxy, sendRedirect, sendStream, sendWebResponse, serveStatic, setCookie, setHeader, setHeaders, setResponseHeader, setResponseHeaders, setResponseStatus, splitCookiesString, toEventHandler, toNodeListener, toPlainHandler, toWebHandler, toWebRequest, unsealSession, updateSession, useBase, useSession, writeEarlyHints } from 'h3';
export { useNitroApp } from 'nitropack/runtime/internal/app';
export { useRuntimeConfig, useAppConfig } from 'nitropack/runtime/internal/config';
export { defineNitroPlugin, nitroPlugin } from 'nitropack/runtime/internal/plugin';
export { defineCachedFunction, defineCachedEventHandler, cachedFunction, cachedEventHandler } from 'nitropack/runtime/internal/cache';
export { useStorage } from 'nitropack/runtime/internal/storage';
export { defineRenderHandler } from 'nitropack/runtime/internal/renderer';
export { defineRouteMeta } from 'nitropack/runtime/internal/meta';
export { getRouteRules } from 'nitropack/runtime/internal/route-rules';
export { useEvent } from 'nitropack/runtime/internal/context';
export { defineTask, runTask } from 'nitropack/runtime/internal/task';
export { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils';
export { buildAssetsURL as __buildAssetsURL, publicAssetsURL as __publicAssetsURL } from 'C:/Users/hp/sistema-de-ingresos-2/node_modules/@nuxt/nitro-server/dist/runtime/utils/paths';
export { defineAppConfig } from 'C:/Users/hp/sistema-de-ingresos-2/node_modules/@nuxt/nitro-server/dist/runtime/utils/config';
export { useSecureAuthCookies, authCookieOptions } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/auth-cookie-options';
export { CONTROL_ESCOLAR_ROLE, FINANCIAL_ADMIN_ROLE, normalizePlantel, parseRoles, hasRole, isSuperAdminRole, hasControlEscolarRole, hasFinancialAdminRole, normalizeAuthRole, isControlEscolarOnlyRole, parsePlanteles, getSuperAdminPlanteles, isValidPlantelScope, hasFinancialAccessForPlantel, getTrustedAuthUser, resolveDataBridgeAgentId } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/auth-session';
export { generateBecaCartaPdf } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/becaCartaPdf';
export { BECA_TYPE_OPTIONS, normalizeBecaTypes } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/becaTypes';
export { fetchCentralMatriculaOverlay, fetchCentralMatriculaOverlays } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/central-matricula-overlay';
export { resolveCfdiPath, proxyCfdiEvent } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/cfdi-proxy';
export { DEFAULT_COBRANZA_EMAIL_SUBJECT, DEFAULT_COBRANZA_EMAIL_TEMPLATE, escapeHtml, normalizeTemplateInput, formatCobranzaMoney, minimumFractionDigits, renderCobranzaEmail } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/cobranzaEmail';
export { CONCEPTO_CATEGORIES, DEFAULT_PLANTELES, canManageConceptosConfig, requireConceptosAdmin, readCentralConceptosConfig, readCentralConceptos, readLocalConceptosConfig, buildConceptosConfigPayload, collectServiceCatalog, collectUnassociatedServices, readBestConceptosConfig, readBestConceptosConfigPayload, syncCentralConceptosConfigToBridge, syncCentralConceptosConfigToBridgeBestEffort, runSyncForActiveBridge, createOrUpdateMapping, deleteMapping, saveCycle, deleteCycle } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/conceptos-config';
export { logControlEscolarAuditEvent, getControlEscolarAuditSummary } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/control-escolar-audit';
export { buildControlEscolarScopeDescriptor, ensureControlEscolarCacheSchema, getControlBaseSourceId, ensureControlBaseSource, fetchVerifiedControlEscolarScopeRows, maybeRefreshVerifiedControlEscolarScopeCache, maybeRefreshControlEscolarCacheFromLoadedRows, maybePublishControlEscolarSnapshotFromBridge, publishControlEscolarSnapshotFromBridge, readControlCacheSourceMeta } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/control-escolar-cache';
export { getControlEscolarCentralDb, controlEscolarCentralQuery, withControlEscolarCentralConnection, getCentralTableColumns, centralTableHasColumn } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/control-escolar-central';
export { getExternalStudentPlanteles, ensureControlEscolarExternalViewSchema, buildExternalControlEscolarScope, writeControlEscolarExternalStudentView, warmExternalControlEscolarStudentScope, warmExternalControlEscolarStudentScopes, readExternalControlEscolarStudents, readExternalControlEscolarStudentDetail, readExternalControlEscolarChanges, readExternalControlEscolarHealth } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/control-escolar-external-view';
export { assertControlEscolarDynamicBridge, resolveControlEscolarAuth, listControlEscolarPlanteles, getControlEscolarSchema, fetchControlEscolarStudentDetail, fetchControlEscolarStudents, refreshVerifiedControlEscolarCacheForScope, fetchControlEscolarSiblingsByParentNames, fetchControlEscolarKpis, CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS, CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS, importControlEscolarMatriculaUpdates, updateControlEscolarStudent, runControlEscolar, fetchControlEscolarExportRows } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/control-escolar';
export { enterBridgeAgentId, runWithBridgeAgentId, getDbTransport, getBridgeAgentId, BRIDGE_AGENT_UNAVAILABLE_MESSAGE, isBridgeAgentUnavailableError, checkBridgeAgentAvailability, getDb, ensureSchema, runRawSqlStatement, query, executeStatementTransaction, executeTransaction } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/db';
export { getDeudoresGlobal, getDeudoresColeg } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/deudores';
export { getDocumentoPeriodoSchema, periodoLifecycleSelect, assertDocumentoPeriodoLifecycleSchema } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/documento-periods';
export { parseEnrollmentConceptIds, getHistoricalEnrollmentConceptEvidence } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/enrollment-evidence';
export { getAuroraExternalApiAuthDiagnostics, getAuroraExternalApiRequestAuthDiagnostics, assertAuroraExternalApiToken, setExternalApiResponseHeaders } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/external-api-auth';
export { readExternalDeudorStatus } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/external-deudores';
export { NO_ADEUDO_CONTROL_PLANTELES_COLUMN, getExternalUsersColumns, getExternalUsersDiagnostics, ensureExternalUsersTable, isExternalUsersAvailable, externalUserAccessMode, queryExternalUsers, findExternalUserByEmail, listExternalUsers, createExternalUser, updateExternalUser, bulkUpdateExternalUsers, hasExternalControlRole, noAdeudoControlUsersColumnExists, listExternalControlUsersForNoAdeudo, getNoAdeudoControlUserForPlantel, setNoAdeudoControlUserForPlantel, touchExternalUserLogin, deleteExternalUser } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/external-users';
export { ACTIVE_SYNC_STATUSES, ENROLLMENT_CONFIG_URL, EXTERNAL_SYNC_URL, EXTERNAL_SYNC_TIMEOUT_MS, EXTERNAL_SYNC_STALE_AFTER_MINUTES, EXTERNAL_SYNC_BATCH_LIMIT, ENROLLMENT_CONFIG_TIMEOUT_MS, LOG_PREFIX, createEmptyCounters, cleanApiKey, getExternalSyncConfig, logSyncInfo, logSyncWarn, logSyncError, normalizeMatricula, safeErrorMessage, toStatusPayload, readSyncRun, cleanupBlockingRuns, markRunStatus, updateRunProgress, finishRun, isRunCancelled, buildExternalUrl, buildExternalHeaders, readExternalErrorBody, extractExternalRows, fetchExternalRows, fetchCurrentEnrollmentCicloKey, mapExternalRow, computeHash, signExternalRow, attachRowSignatures, detachAndVerifySignedRow, resolveFinalEstatus, processExternalRowsBatch } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/externalBaseSync';
export { WORKSPACE_DOMAIN, WORKSPACE_DIRECTORY_SCOPE, isCasitaWorkspaceEmail, getWorkspaceDirectoryService, buildWorkspacePhotoUrl, searchWorkspaceDirectoryUsers, getWorkspaceDirectoryUsersByEmails, getWorkspaceDirectoryPhoto } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/google-workspace-directory';
export { getAdminProfilePhoto } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/googleAdmin';
export { createImpersonationToken, verifyImpersonationToken, impersonationCookieOptions, impersonatedAuthCookieOptions, impersonationSecondsRemaining, clearImpersonationCookies } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/impersonation-session';
export { LOCAL_SYSTEM_BRIDGE_COMMAND, unwrapLocalSystemBridgeResult } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/local-system-handoff';
export { isLocalSystemRuntime, requestLocalSystemManager } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/local-system-manager';
export { sendEmail } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/mailer';
export { parseNullableMoney, isWholeMoney, legacyProjectedAmount, resolveProjectedAmount } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/monto-final';
export { diagnoseNoAdeudoError, throwNoAdeudoDiagnosticError, getNoAdeudoSettings, calculateNoAdeudoDebt, resolveNoAdeudoStudentContext, selectNoAdeudoRecipients, createNoAdeudoToken, decodeNoAdeudoToken, resolveNoAdeudoVerifyBaseUrl, buildNoAdeudoValidationUrl, renderNoAdeudoEmail, buildNoAdeudoPreviewPayload, generateNoAdeudoPdfForContext, persistNoAdeudoDeudorCartaMark, sendNoAdeudoForContext } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/noAdeudo';
export { generateNoAdeudoCartaPdf } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/noAdeudoCartaPdf';
export { numeroALetras } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/numberToWords';
export { normalizePaymentMethod, isOtherCampusPayment, isDepuradoPayment } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/payment-classification';
export { resolvePaymentConceptSnapshot } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/payment-concept';
export { generateQrMatrix } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/qr';
export { normalizeCicloForTipoIngreso, previousCicloKey, nextCicloKey, resolveTipoIngreso, formatTipoIngresoValue } from 'C:/Users/hp/sistema-de-ingresos-2/shared/utils/tipoIngreso';
export { isScopedToActivePlantel, attachCustomSectionsToStudents } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/student-sections';
export { readCentralTalleresServiciosCatalog, readLocalTalleresServiciosCatalog, readBestTalleresServiciosCatalog, syncCentralTalleresServiciosCatalogToBridge, readCentralMatriculaServicios, resolveServiciosWithCatalog, updateCentralMatriculaServicio, findTallerServicioForConcept, appendConceptMappedServicioToMatricula, serializeServicios } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/talleres-servicios';
export { whatsappApi } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/whatsapp';
export { createXlsxWorkbook } from 'C:/Users/hp/sistema-de-ingresos-2/server/utils/xlsx';