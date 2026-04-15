export default defineNuxtConfig({
  runtimeConfig: {
    // Configuración de base de datos utilizada por el pool de mysql2 en server/utils/db.ts
    mysqlHost: process.env.MYSQL_HOST,
    mysqlUser: process.env.MYSQL_USER,
    mysqlPassword: process.env.MYSQL_PASSWORD,
    mysqlDatabase: process.env.MYSQL_DATABASE,

    // Credenciales de Google Workspace utilizadas por server/utils/googleAdmin.ts y server/utils/mailer.ts
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GCP_CLIENT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY || process.env.GCP_PRIVATE_KEY,
    adminEmailToImpersonate: process.env.ADMIN_EMAIL_TO_IMPERSONATE || process.env.GCP_ADMIN_SUBJECT,

    // Credenciales legacy utilizadas por server/api/directory/photo.get.ts
    gcpClientEmail: process.env.GCP_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    gcpPrivateKey: process.env.GCP_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY,
    gcpAdminSubject: process.env.GCP_ADMIN_SUBJECT || process.env.ADMIN_EMAIL_TO_IMPERSONATE,

    public: {
      // Client ID expuesto al lado del cliente utilizado por el inicio de sesión
      googleClientId: process.env.GOOGLE_CLIENT_ID
    }
  }
})