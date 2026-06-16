import { fileURLToPath } from 'node:url'

const clientAppManifestFallback = fileURLToPath(new URL('./node_modules/mocked-exports/lib/empty.mjs', import.meta.url))

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css', '~/assets/css/pages/students.css', '~/assets/css/components/student-details.css'],
  modules: ['@nuxtjs/tailwindcss'],
  vite: {
    $client: {
      resolve: {
        alias: {
          '#app-manifest': clientAppManifestFallback
        }
      }
    }
  },
  runtimeConfig: {
    dbTransport: process.env.DB_TRANSPORT || 'direct',
    dbBridgeUrl: process.env.DB_BRIDGE_URL || 'http://127.0.0.1:8787',
    dbBridgeToken: process.env.DB_BRIDGE_TOKEN || '',
    dbBridgeTimeoutMs: process.env.DB_BRIDGE_TIMEOUT_MS || '45000',
    dbBridgeAgentId: process.env.DB_BRIDGE_AGENT_ID || '',
    dbBridgeAgentIdCookie: process.env.DB_BRIDGE_AGENT_ID_COOKIE || 'db_bridge_agent_id',
    dbBridgeAutoMigrateOnStartup: process.env.DB_BRIDGE_AUTO_MIGRATE_ON_STARTUP || '',

    mysqlHost: process.env.MYSQL_HOST || 'localhost',
    mysqlPort: process.env.MYSQL_PORT || '3306',
    mysqlUser: process.env.MYSQL_USER || 'root',
    mysqlPassword: process.env.MYSQL_PASSWORD || '',
    mysqlDatabase: process.env.MYSQL_DATABASE || 'sistema_ingresos',

    controlEscolarMysqlHost: process.env.CONTROL_ESCOLAR_MYSQL_HOST || '',
    controlEscolarMysqlPort: process.env.CONTROL_ESCOLAR_MYSQL_PORT || '3306',
    controlEscolarMysqlUser: process.env.CONTROL_ESCOLAR_MYSQL_USER || '',
    controlEscolarMysqlPassword: process.env.CONTROL_ESCOLAR_MYSQL_PASSWORD || '',
    controlEscolarMysqlDatabase: process.env.CONTROL_ESCOLAR_MYSQL_DATABASE || '',
    controlEscolarMysqlConnectionLimit: process.env.CONTROL_ESCOLAR_MYSQL_CONNECTION_LIMIT || '10',

    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    adminEmailToImpersonate: process.env.GOOGLE_ADMIN_EMAIL || 'desarrollo.tecnologico@casitaiedis.edu.mx',
    gcpClientEmail: process.env.GCP_CLIENT_EMAIL,
    gcpPrivateKey: process.env.GCP_PRIVATE_KEY,
    gcpAdminSubject: process.env.GCP_ADMIN_SUBJECT,

    githubUsername: process.env.GITHUB_USERNAME || '',
    githubToken: process.env.GITHUB_TOKEN || '',

    externalSyncApiKey: process.env.EXTERNAL_SYNC_API_KEY || '',
    auroraApiToken: process.env.AURORA_API_TOKEN || process.env.EXTERNAL_CONTROL_ESCOLAR_API_TOKEN || '',
    studentPhotoBaseUrl: process.env.STUDENT_PHOTO_BASE_URL || 'https://matricula.casitaapps.com',
    studentPhotoApiKey: process.env.STUDENT_PHOTO_API_KEY || process.env.EXTERNAL_SYNC_API_KEY || '',

    authImpersonationSecret: process.env.AUTH_IMPERSONATION_SECRET || '',

    localSystemMode: process.env.LOCAL_SYSTEM_MODE || '',
    localSystemManagerUrl: process.env.LOCAL_SYSTEM_MANAGER_URL || 'http://127.0.0.1:8790',
    localSystemManagerToken: process.env.LOCAL_SYSTEM_MANAGER_TOKEN || '',
    localSystemBuildSha: process.env.LOCAL_SYSTEM_BUILD_SHA || '',
    localSystemBuildVersion: process.env.LOCAL_SYSTEM_BUILD_VERSION || '',
    localSystemBuildDate: process.env.LOCAL_SYSTEM_BUILD_DATE || '',
    localSystemPlantel: process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || '',
    localSystemCookieSecure: process.env.LOCAL_SYSTEM_COOKIE_SECURE || '',

    public: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      localSystemMode: process.env.LOCAL_SYSTEM_MODE || ''
    }
  },
  app: {
    head: {
      title: 'Sistema de Ingresos | IECS-IEDIS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Montserrat:wght@500;600;700&display=swap' }
      ]
    }
  }
})
