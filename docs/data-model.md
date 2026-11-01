# Modelo de datos

```
profiles ─┬─< coach_assignments >── categories ──< player_season_categories >── players
          │                     └── seasons ────┘                               │
          │                                                                     ├── player_private (1:1, sensible)
          │                                                                     ├─< player_guardians >── guardians
          │                                                                     ├─< consents ── consent_types
          │                                                                     ├─< wellness_logs
          │                                                                     └─< injuries ──< injury_notes (clínico)
          │
evaluation_sessions (season, category, tipo) ──< results >── test_metrics >── test_types
```

## Decisiones

| Tema | Decisión |
|---|---|
| Categoría | Por temporada (`player_season_categories`). Cada `result` guarda snapshot de categoría y puesto. |
| Offline | IDs UUID generados en el celular; upsert por `id` es idempotente. `updated_at` + `deleted_at` (soft delete) para sincronizar. |
| Métricas derivadas | 1RM (Epley), VO₂máx Yo-Yo IR1 (Bangsbo), offset de PHV (Mirwald). Las calcula un trigger; el cliente no puede escribirlas. |
| Validación en cancha | `test_metrics.min_valid/max_valid` rechazan errores de tipeo (`hint = out_of_range`). |
| Consentimiento | Bloqueo duro: sin consentimiento vigente no se cargan resultados (`performance_data`; GPS requiere `gps_tracking`), bienestar ni lesiones (`medical_data`). Menor ⇒ firma un tutor vinculado. |
| Datos sensibles | `player_private` e `injury_notes` separados para aplicar RLS más estricta. |
| Benchmarks | `category_benchmarks()` (security definer) devuelve sólo agregados con n ≥ 3; un profe compara contra el club sin ver individuos ajenos. |
| Comparación | `player_comparison()` devuelve la serie y z-scores vs. categoría, unidad (forwards/backs), línea y puesto (el puesto rara vez llega a n ≥ 3; la línea es la referencia posicional útil). z > 0 = mejor que el promedio, siempre. |
| Auditoría | `audit_log` con diff por columna sobre datos de menores, consentimientos, lesiones y cambios/bajas de resultados. |

## Escalas

* Bienestar: 1–5, **5 = mejor estado** (sueño, fatiga, dolor muscular, estrés, ánimo). `wellness_score` 5–25.
* RPE: CR-10 (0–10). `srpe_load = RPE × minutos`.
* ACWR: promedio 7 d / promedio 28 d sobre sRPE (`v_player_acwr`).
* Maduración: pre-PHV < −1, circa −1…1, post-PHV > 1 (`v_maturation`).

## Seguridad (RLS)

La matriz completa está en el encabezado de `supabase/migrations/*_rls.sql`. Resumen:

* **Perfil inactivo ⇒ no ve nada.** Las cuentas nacen inactivas; sólo un admin cambia rol, estado o email.
* **coach**: ve los jugadores asignados a sus categorías en la temporada actual, **con todo su historial**. Carga sesiones/resultados sólo en sus categorías y temporadas asignadas; wellness y alta de lesiones de sus jugadores. No ve `player_private`, tutores, notas clínicas ni auditoría. No puede modificar identidad del jugador (nombre, nacimiento, sexo).
* **medical**: ve todo el plantel, datos privados y notas clínicas; gestiona lesiones; no carga resultados.
* **admin**: todo. Único que crea jugadores, tutores, consentimientos y asignaciones, y que borra físicamente.
* **anon**: sin acceso a `public`.
* Benchmarks: agregados (n ≥ 3) vía función `security definer`; nunca filas individuales.

* Las políticas usan conjuntos de ids visibles (`col in (select private.visible_player_ids())`), evaluados una vez por consulta. Nunca funciones por fila que recorran tablas grandes (ver migración 0009).

Tests: `tests/db/02_rls.sql` (≈55 asserts por rol, incluye regresión de performance con statement_timeout).
