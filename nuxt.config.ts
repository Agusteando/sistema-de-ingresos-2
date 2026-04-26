import { fileURLToPath } from 'node:url'

const clientAppManifestFallback = fileURLToPath(new URL('./node_modules/mocked-exports/lib/empty.mjs', import.meta.url))

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
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

    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    adminEmailToImpersonate: process.env.GOOGLE_ADMIN_EMAIL || 'desarrollo.tecnologico@casitaiedis.edu.mx',
    gcpClientEmail: process.env.GCP_CLIENT_EMAIL,
    gcpPrivateKey: process.env.GCP_PRIVATE_KEY,
    gcpAdminSubject: process.env.GCP_ADMIN_SUBJECT,

    externalSyncApiKey: process.env.EXTERNAL_SYNC_API_KEY || '',
    studentPhotoBaseUrl: process.env.STUDENT_PHOTO_BASE_URL || 'https://matricula.casitaapps.com',

    public: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    }
  },
  app: {
    head: {
      title: 'Sistema de Ingresos | IECS-IEDIS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
})
