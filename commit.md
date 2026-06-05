Corrige autenticación de la API externa de Aurora en Vercel

Lee el token externo directamente desde variables de entorno en runtime, acepta encabezados Authorization, x-aurora-token y x-api-key de forma consistente, agrega compatibilidad temporal con el nombre AURORA_STUDENTS_API_TOKEN para evitar fallas de configuración entre proyectos y expone diagnósticos seguros sin revelar secretos para validar la integración con SIPAE.
