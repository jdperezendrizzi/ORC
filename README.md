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
