# ORC · Sistema de rendimiento

Datos de rendimiento del club, de infantiles a Primera. Cada profe ve sólo su categoría.

**Stack:** Supabase (Postgres + Auth + RLS) · Next.js + TypeScript (mobile-first, offline-first).

## Estructura

```
supabase/
  config.toml
  migrations/        esquema (orden por timestamp)
  seed.sql           catálogo de tests, categorías, puestos (+ demo)
scripts/db/
  supabase_stub.sql  stub de auth/roles para validar sin Docker
  verify.sh          migra una base limpia y corre los tests
tests/db/            tests SQL (asserts) de lógica y RLS
docs/data-model.md   modelo y decisiones
web/                 app Next.js (ver web/README.md)
```

## Desarrollo

```bash
# Con Supabase CLI + Docker
supabase start
supabase db reset          # migraciones + seed

# Sin Docker (Postgres local cualquiera)
PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/db/verify.sh

# Web app
cd web && cp .env.example .env.local && npm install && npm run dev
```

## Datos

* **Catálogo de referencia** (`migrations/*_reference_catalog.sql`): 15 puestos, tipos de consentimiento y 15 tests / 41 métricas con rangos de plausibilidad. Va como migración porque producción también lo necesita.
* **`seed.sql`** (solo local): temporada 2026, categorías M12–Primera y datos **ficticios** de demo con semilla fija: 45 jugadores (M15, M17 y Primera), 2 testeos y 1 partido por categoría, 6 semanas de bienestar y 3 lesiones de ejemplo.

### Usuarios demo (contraseña `orc-demo-2026`)

| Email | Rol |
|---|---|
| admin@orc.test | admin |
| profe.m15@orc.test | coach M15 |
| profe.m17@orc.test | coach M17 |
| profe.primera@orc.test | coach Primera + Intermedia |
| medico@orc.test | medical |

Casos para probar en la app: el último jugador de M15 tiene **revocado el consentimiento de salud** (debe bloquear la carga de lesiones) y en M15 el seed no carga tests de fuerza máxima.

## Proyecto en la nube (Supabase)

Proyecto `orc-rendimiento` (plan free, región `sa-east-1`) con las 9 migraciones aplicadas y los datos de demo cargados.

* URL: `https://xcpoczzznnexjkbthpyb.supabase.co`
* Clave pública: la *publishable key* del panel (Settings → API). Es pública por diseño; la seguridad la da RLS.
* Usuarios demo: los mismos emails de la tabla de arriba, pero **con otra contraseña** (no la del repo, porque el proyecto está en internet). Se pasó por chat; no se commitea.

### Antes de cargar datos reales

1. Borrar los usuarios demo (`Authentication → Users`, los `@orc.test`) y los jugadores `(demo)`.
2. Crear el usuario admin real por invitación y activarlo (`profiles.role = 'admin'`, `active = true`).
3. Activar *Leaked password protection* en Authentication → Settings (lo marca el advisor de seguridad).
4. Deshabilitar el registro abierto (Authentication → Sign In / Providers): las cuentas las crea el admin.

### Publicar la web (Vercel, plan Hobby gratis)

1. Importar el repo en Vercel con **Root Directory = `web`**.
2. Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key).
3. En Supabase → Authentication → URL Configuration, poner la URL de Vercel como *Site URL*.

### Pantallas de admin (`/admin`)

Sólo para usuarios con rol admin. Jugadores (alta, edición, categoría y camiseta de la temporada, baja,
**importación desde Excel/CSV** en `/admin/jugadores/importar`), tutores,
consentimientos (registrar y revocar), datos privados y de emergencia, usuarios (rol, activo, categorías a cargo) y
temporadas.

Para **invitar usuarios por email desde la app** hace falta, una sola vez:

1. Vercel → Settings → Environment Variables: `SUPABASE_SERVICE_ROLE_KEY` = la *secret key* de Supabase
   (Settings → API Keys). Es secreta: **nunca** con prefijo `NEXT_PUBLIC_` ni en el repo. Redeploy.
2. Supabase → Authentication → URL Configuration → *Redirect URLs*: agregar `https://<tu-app>.vercel.app/cuenta/clave`.

Sin la variable, la pantalla de usuarios explica cómo crear la cuenta desde Supabase y activarla en la app.
El plan gratis de Supabase limita los emails de autenticación por hora.

### Compartir y exportar

* **Informe del jugador en PDF** (perfil del jugador → *Compartir informe*): en el celular abre el menú de compartir
  (WhatsApp, mail…); en la compu se descarga. Incluye **sólo rendimiento** (fuerza, velocidad, potencia, agilidad,
  resistencia y partido): sin antropometría, bienestar, lesiones ni datos personales.
* **Menores**: sólo con el consentimiento «Acceso de la familia» vigente. Lo verifica la base
  (`authorize_player_report`), no sólo la pantalla.
* **Exportar Excel** de la categoría (página de la categoría): mejores marcas de rendimiento de la temporada, para uso
  interno del staff.
* Todo queda registrado en `share_log` (quién, cuándo, qué jugador o categoría).
