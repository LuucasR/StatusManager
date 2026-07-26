# Status Manager

Aplicación responsive para registrar y supervisar actividades de empleados en tiempo real.

## Funcionalidades incluidas

- Solicitud de registro con número de empleado automático y aprobación administrativa.
- Login JWT. Por decisión del proyecto, las contraseñas se guardan en texto plano en SQLite.
- Cambio de estado con detalle obligatorio.
- Historial personal y panel administrador.
- Contadores de duración en vivo y actualizaciones con Socket.IO.
- Reporte PDF descargable.
- Avisos por email para nuevas altas y cambios de estado (cuando SMTP está configurado).

## Desarrollo local

### Backend

```bash
cd backend
copy .env.example .env
pnpm install
pnpm prisma generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

El seed crea el administrador `#1000`. Cambiá `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env`; si no se indican, la contraseña inicial de desarrollo es `Admin123!`.

> Advertencia: las contraseñas almacenadas en texto plano pueden ser leídas por cualquiera que tenga acceso a `dev.db`. Esta configuración no es adecuada para producción.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

La API se configura con `VITE_API_URL` y por defecto usa `http://localhost:3000`.

## Próximos pasos

- Filtros por fecha para reportes personales y administrativos.
- Recuperación de contraseña y auditoría administrativa.
- Integración con WhatsApp.
