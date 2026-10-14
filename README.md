# SAE API – Sistema de Atención al Estudiante

API REST con Node.js · Express · Mongoose (JavaScript). Solo backend, sin interfaz.

## Puesta en marcha
```bash
npm install
cp .env.example .env            # en PowerShell: copy .env.example .env
# editar .env: MONGODB_URI (con el nombre de tu base), JWT_SECRET
node scripts/set-password.js    # asigna contraseña inicial (Sae2026*) a encargadas/admin
npm start                       # http://localhost:3000/api
```
Colecciones: `estudiantes`, `encargadas`, `solicitudes`, `casos`, `notificaciones_correo`.
Cambio en la BD: la colección `encargadas` usa un campo nuevo `password_hash` (lo crea el script).
Sin `SMTP_HOST`, los correos se **simulan** y se imprimen en la consola del servidor (incluido el enlace de confirmación).

## Probar con Postman
Importa `SAE-API.postman_collection.json`. Ejecuta primero **Auth → Login**: guarda el token solo y lo usa en el resto de peticiones.

## Autenticación
`POST /api/auth/login` con `{ "usuario": "<nombre o correo>", "password": "..." }` devuelve `{ token, usuario }`.
Las rutas protegidas exigen el header `Authorization: Bearer <token>`. Token válido según `JWT_EXPIRES` (8h por defecto).
5 intentos fallidos bloquean al usuario/IP por 15 minutos.

## Endpoints
| Método y ruta | Acceso | HU |
|---|---|---|
| `POST /api/auth/login` | Público | — |
| `GET /api/auth/me` | Sesión | — |
| `POST /api/solicitudes` | Público | 01, 02, 15 |
| `POST /api/solicitudes/:solicitud_id/reenviar` | Público | 02 |
| `GET /api/solicitudes/confirmar/:token` | Público (enlace del correo) | 03, 04 |
| `GET /api/solicitudes/estudiante/:codigo` | Público | seguimiento |
| `GET /api/casos?tipo_caso=&prioridad=&estado_actual=` | Encargada (Admin ve todos) | 06 |
| `GET /api/casos/estudiante/:codigo` | Encargada / Admin | 11 |
| `GET /api/casos/:caso_id` | Encargada / Admin | — |
| `POST /api/casos` (caso presencial) | Encargada | 06 |
| `POST /api/casos/:caso_id/observaciones` | Encargada asignada | 07 |
| `POST /api/casos/:caso_id/documentos` | Encargada asignada | 08 |
| `PATCH /api/casos/:caso_id/estado` | Encargada asignada | 09 |
| `POST /api/casos/:caso_id/observaciones/:indice/enviar` | Encargada asignada | 05, 10 |
| `GET /api/admin/carga` | Admin | 12 |
| `PATCH /api/admin/casos/:caso_id/asignar` | Admin | 12 |
| `GET /api/admin/panel-pendientes` | Admin | 13 |
| `GET /api/admin/reporte-expiradas?desde=&hasta=&tipo_caso=` | Admin | 14 |
| Tarea programada cada 5 min y al arrancar | Sistema | 16, 04 |

## Ejemplos
**Radicar solicitud** `POST /api/solicitudes`
```json
{ "codigo_estudiante": "20231001", "tipo_caso": "Suficiencia",
  "motivo": "Ya domina el contenido del curso", "descripcion": "Solicita examen de suficiencia de Redes" }
```
Respuesta `201`: `{ "solicitud_id": "S005", "estado_verificacion": "Pendiente", "token_expira": "...", "correo_enviado_a": "...", "estado_envio": "Enviado", "mensaje": "..." }`

**Confirmar** `GET /api/solicitudes/confirmar/:token` → `200 { "ok": true, "mensaje": "...", "caso_id": "C011" }`

**Cambiar estado** `PATCH /api/casos/C006/estado` con `{ "estado": "Resuelta" }`

**Reasignar** `PATCH /api/admin/casos/C001/asignar` con `{ "encargada_id": "E004" }`

## Códigos de respuesta
`200/201` ok · `400` datos inválidos · `401` sin sesión o credenciales incorrectas · `403` sin permiso (rol o caso de otra encargada) · `404` no encontrado · `409` ya confirmado / sin cambios · `410` enlace expirado · `429` demasiados intentos · `502` correo fallido.

## Reglas de negocio
- Valores válidos de `tipo_caso`: Reingreso, Homologación, Cancelación, Suficiencia, Preparatorio, Trabajo de grado.
- El token de confirmación dura 24 h, es único y de un solo uso. Al confirmar se crea el caso y se asigna a la encargada con menos casos activos.
- Prioridad inicial según el tipo (editable en `utils/config.js`).
- Los adjuntos guardan solo el nombre del archivo (no hay subida real).
- Fechas y horas en hora de Colombia, con el formato de la BD (`2026-08-19`, `03:20 PM`).
- Las observaciones y el historial de estados solo se agregan, nunca se modifican.
- El enlace del correo usa `BASE_URL` del `.env`.
