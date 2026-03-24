# Insignia CRM - Backend API

El servidor estará disponible en: `http://localhost:3000`

Autenticación

El API usa JWT (JSON Web Tokens) para autenticación. 

1. Hacer login en `/api/v1/auth/login`
2. Usar el `accessToken` en el header: `Authorization: Bearer <token>`
3. Refrescar el token cuando expire usando `/api/v1/auth/refresh`


Seguridad

- Contraseñas hasheadas con bcrypt
- Tokens JWT con expiración
- Validación de roles y permisos
- Headers de seguridad con Helmet
- CORS configurado


MIT License - Insignia Conecta


- Email: contacto@insigniaconecta.com
- Website: https://insigniaconecta.com
