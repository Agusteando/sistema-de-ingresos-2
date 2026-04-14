export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    mysqlHost: process.env.MYSQL_HOST || 'localhost',
    mysqlUser: process.env.MYSQL_USER || 'root',
    mysqlPassword: process.env.MYSQL_PASSWORD || '',
    mysqlDatabase: process.env.MYSQL_DATABASE || 'sistema_ingresos',
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    adminEmailToImpersonate: process.env.GOOGLE_ADMIN_EMAIL || 'admin@casitaiedis.edu.mx',
    public: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    }
  },
  app: {
    head: {
      title: 'SISTEMA DE INGRESOS 2 | IECS-IEDIS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
})