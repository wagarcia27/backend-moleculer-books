[![Moleculer](https://badgen.net/badge/Powered%20by/Moleculer/0e83cd)](https://moleculer.services)

## Backend de Book Reviews (Moleculer)
Este proyecto implementa una API de reseñas/biblioteca de libros usando Moleculer + moleculer-web y persistencia con moleculer-db.

### Arquitectura (alto nivel)
- `moleculer-web` expone la API HTTP desde el servicio `api`.
- Cada dominio es un servicio Moleculer con `actions` (p. ej. `users`, `books`, `searches`).
- `mixins/db.mixin.js` agrega persistencia (Mongo si existe `MONGO_URI`; si no, almacenamiento local con `MemoryAdapter` guardado en `data/*.db`).
- Autenticación Basic en el gateway: credenciales se validan contra DB via `users.validateBasic` y el usuario resultante se adjunta en `ctx.meta.user`.

### Estructura de carpetas
- `services/api.service.js`: gateway HTTP (CORS, rutas, auth, logging y aliases).
- `services/users.service.js`: registro de usuarios y validación de credenciales.
- `services/books.service.js`: búsquedas en OpenLibrary, biblioteca personal y endpoint de inicio por usuario.
- `services/searches.service.js`: guarda y consulta últimas búsquedas por usuario.
- `mixins/db.mixin.js`: selección de adapter y utilidades de cache/seed.
- `public/`: archivos estáticos (opcional).
- `data/`: archivos de base local cuando no hay `MONGO_URI`.

### Endpoints principales
- Autenticación y registro
  - `POST /api/auth/register` → Crea usuario. Valida duplicado. Responde 409 si `username` ya existe.
  - `GET /api/auth/login` → Valida header `Authorization: Basic <base64(user:pass)>`. Devuelve `{ ok, username, token }`.
  - `GET /api/auth/whoami` → Retorna `{ ok, username }` si el token Basic es válido.

- Búsquedas y “home”
  - `GET /api/books/search?q=Term` → Integra con OpenLibrary (máx 10). Registra el término de búsqueda para el usuario autenticado.
  - `GET /api/books/home` → Devuelve los 10 resultados de la última búsqueda del usuario autenticado. Si no hay búsquedas, retorna `[]`.

- Biblioteca personal
  - `POST /api/books/my-library` → Crea libro en la biblioteca del usuario. Acepta portada base64 o `coverId` (descarga automática). Enriquecer `publishYear` si puede.
  - `GET /api/books/my-library` → Lista filtrable (q, author, hasReview, sort) SOLO del usuario autenticado.
  - `GET /api/books/my-library/:id` → Obtiene un libro del usuario; asegura ownership.
  - `PUT /api/books/my-library/:id` → Actualiza `review` y/o `rating`; asegura ownership.
  - `DELETE /api/books/my-library/:id` → Elimina; asegura ownership.
  - `GET /api/books/front-cover/:id` → Devuelve portada (base64 o fallback). Público para facilitar imágenes.

### Autenticación Basic (cómo funciona)
1. El cliente envía `Authorization: Basic base64(username:password)`.
2. El gateway (`api.authenticate`) decodifica y llama `users.validateBasic` para comparar la contraseña con el hash en DB (`bcrypt`).
3. Si es válido, `ctx.meta.user = { username }` y se permite la acción; si no, 401.
4. Rutas públicas (no requieren auth): `/api/auth/register`, `/api/auth/login`, `/api/auth/whoami`, `/api/docs`, y portadas.

### Logging de endpoints
El gateway registra por consola cada request: método, URL, código de estado, tiempo y usuario (si aplica). Errores también se registran con detalle básico.

### Cómo ejecutar localmente
1. Requisitos: Node 18+.
2. Instalar dependencias:
   - `npm install`
3. Elegir persistencia:
   - Con Mongo: exporta `MONGO_URI` y se usará `moleculer-db-adapter-mongo`.
   - Sin Mongo: se usa `MemoryAdapter` persistiendo en `./data/*.db`.
4. Levantar en desarrollo: `npm run dev`
   - Servirá en `http://localhost:3000/`.

### Variables de entorno
- `PORT`: puerto HTTP (por defecto 3000).
- `MONGO_URI`: si se define, la persistencia será MongoDB (colecciones `users`, `books`, `searches`).

### Flujo típico (front)
1. Registro: `POST /api/auth/register`.
2. Login: `GET /api/auth/login` (enviar `Authorization: Basic ...`). Guardar `token` que retorna.
3. Whoami: `GET /api/auth/whoami` para validar/restaurar sesión.
4. Inicio: `GET /api/books/home` (requiere `Authorization`).
5. Buscador: `GET /api/books/search?q=...` (registra término por usuario).
6. Biblioteca: CRUD en `/api/books/my-library` (siempre con `Authorization`).

### Seguridad y consideraciones
- Contraseñas en DB se guardan como hash `bcrypt` (campo `passwordHash`).
- El “logout” en Basic es cliente: dejar de enviar el header `Authorization`.
- El API diferencia datos por usuario usando `ctx.meta.user.username` en consultas.

### Scripts NPM
- `npm run dev` → desarrollo con hot-reload y REPL.
- `npm run start` → modo producción del runner.
- `npm run cli` → conecta REPL a producción.
- `npm run lint` → ESLint sobre `services/`.
- `npm run ci` → Jest en watch.
- `npm test` → Jest con cobertura (config en `package.json`).

### Tests
La carpeta `test/` contiene ejemplos unit/integration (greeter, products). Puedes ampliarla para `users` y `books`.

### Despliegue
El gateway es stateless. Asegura variables de entorno y persistencia (`MONGO_URI` o volumen para `data/`).

### Referencias
- Moleculer: `https://moleculer.services/`
- Doc moleculer-web: `https://moleculer.services/docs/0.14/moleculer-web.html`
