Permite autenticación por token en API externa de Aurora

Excluye las rutas /api/external del middleware de sesión para que la API externa pueda validarse únicamente con el token de servicio, evitando que las solicitudes server-to-server desde SIPAE sean rechazadas antes de revisar los headers de autenticación.
