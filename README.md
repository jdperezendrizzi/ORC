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
```

## Desarrollo

```bash
# Con Supabase CLI + Docker
supabase start
supabase db reset          # migraciones + seed

# Sin Docker (Postgres local cualquiera)
PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/db/verify.sh
```
