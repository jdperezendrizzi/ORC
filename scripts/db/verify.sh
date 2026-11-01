#!/usr/bin/env bash
# Aplica stub + migraciones (+ seed y tests si existen) sobre una base nueva.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/db/verify.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${VERIFY_DB:-orc_verify}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"; "${PSQL[@]}" -d "$DB" -f "$f"
done
if [[ -f "$ROOT/supabase/seed.sql" ]]; then
  echo "→ seed.sql"; "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/seed.sql"
fi
for f in "$ROOT"/tests/db/*.sql; do
  [[ -e "$f" ]] || continue
  echo "→ test $(basename "$f")"; "${PSQL[@]}" -d "$DB" -f "$f"
done
echo "OK"
