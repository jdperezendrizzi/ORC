# ORC Rendimiento · web

Next.js 15 (App Router) + TypeScript + Tailwind 4 + Supabase. Mobile-first, identidad del club (negro `#231F20` / naranja `#F1882A` / blanco, tomados del escudo oficial `public/crest.png`).

## Correr

```bash
cp .env.example .env.local      # URL y anon key de Supabase (local: `supabase status`)
npm install
npm run dev                     # http://localhost:3000
npm test                        # unit tests (validación + motor offline)
npm run typecheck
```

Usuarios demo: ver README raíz (`supabase db reset` carga el seed).

## Pantallas

| Ruta | Qué hace | Sin señal |
|---|---|---|
| `/login` | Ingreso con email/contraseña (las cuentas las crea el admin) | — |
| `/` | Categorías del usuario, disponibilidad (lesionados), faltas de consentimiento, últimas sesiones | copia guardada |
| `/cargar` | Sesión → test → grilla por jugador e intento. Valida rangos al tipear, bloquea jugadores sin consentimiento, preview de 1RM | ✅ |
| `/bienestar` | Sueño, 5 ítems 1–5, RPE y minutos por jugador y día | ✅ |
| `/categorias/[id]` | Plantel con mejores marcas de la temporada, estado y consentimientos | — |
| `/jugadores/[id]` | Evolución vs. promedio de categoría y línea, z-scores, fuerza relativa, maduración (PHV), ACWR, lesiones | no se guarda (datos de menores) |

## Offline (cómo funciona)

* **Datos**: al abrir `/cargar` o `/bienestar` con señal se descargan a IndexedDB planteles, tests, sesiones y consentimientos del usuario.
* **Cambios**: cada valor va a una *outbox* local y se sube con `upsert` cuando hay señal (al reconectar, cada 30 s y al cargar algo). Orden: sesiones → resultados → bienestar.
* **Idempotencia**: el id de un resultado se deriva de (sesión, jugador, métrica, intento) y el de bienestar de (jugador, fecha). Reenviar o corregir pisa el mismo registro; dos celulares no duplican.
* **Errores**: sin red / sesión vencida ⇒ queda pendiente. Errores de datos (consentimiento, rango, permisos) ⇒ la celda queda en rojo con el motivo y se puede descartar. Un error no frena al resto del lote.
* **Service worker** (`public/sw.js`, sólo en build de producción): guarda `/`, `/cargar` y `/bienestar` para abrirlas sin señal. Los perfiles de jugadores no se guardan en el dispositivo.
* **Cerrar sesión** borra los datos locales (avisa si hay cambios sin subir).

Íconos: `npm run icons` regenera los PNG desde `public/crest.svg` (usa Playwright).
