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
