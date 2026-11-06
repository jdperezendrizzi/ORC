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

Proyecto `orc-rendimiento` (plan free, región `sa-east-1`) con todas las migraciones aplicadas y los datos de demo cargados.

* **App publicada (demo):** https://orc-web-phi.vercel.app

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

### Alertas y resumen semanal con IA

* **Alertas** (Inicio y página de cada categoría, sólo cuerpo técnico). Reglas simples, sin IA (`web/src/lib/alerts.ts`):
  regreso de lesión vencido · carga de 7 días ≥ 1,5× el promedio de 4 semanas · bienestar ≤ 12/25 en los últimos
  3 registros · caída en un test físico (3 % en tiempos, 5 % en el resto) respecto de la medición anterior.
* **Resumen de la semana** (página de la categoría → *Generar resumen*): últimos 7 días de bienestar, carga,
  evaluaciones, mejoras, lesiones y alertas. Se guarda en `weekly_summaries` (uno por categoría y semana).
* **Privacidad**: a la IA se le mandan **sólo números y códigos** (J1, J2…), nunca nombres ni zona de lesión. Los
  nombres se ponen en la app al mostrarlo, con el RLS de quien lo mira. La tabla tampoco guarda nombres.
* **IA gratis (Groq)**: crear una API key en <https://console.groq.com/keys> y cargarla en Vercel como
  `GROQ_API_KEY` (sin `NEXT_PUBLIC_`), y redeploy. Opcional: `GROQ_MODEL` (por defecto `llama-3.3-70b-versatile`).
  Sin clave, o si la IA falla, el resumen se arma con una plantilla con los mismos datos. Para cuidar el cupo gratis
  no se regenera más de una vez cada 5 minutos por categoría.

### Objetivos por categoría (checklist)

* **Admin → Objetivos**: por categoría, cada objetivo con área (juego, contacto/tackle, actitud), *qué mirar* y un
  ejercicio sugerido (explicación y link opcional a video). Se pueden editar, ordenar, desactivar y copiar de otra
  categoría. Hay un **borrador para M6 y M7** para corregir.
* **Asistencia → Objetivos** (menú del profe y del admin): el checklist de la categoría. Después de la práctica el profe tacha lo
  que el equipo cumplió (y puede dejar una nota). **Funciona sin señal.** Un objetivo tachado queda logrado hasta que
  se destacha en otra práctica; cada marca queda con fecha, así se ve la evolución en la temporada.
* Permisos (RLS): el admin carga los objetivos; el profe los ve y tacha sólo en sus categorías; el área médica no
  los usa. Los objetivos del equipo no son datos personales (no piden consentimiento). Los objetivos **por jugador**
  (`scope = 'player'`, para más adelante) exigen el consentimiento de datos de rendimiento.
* Categorías agregadas: M6 a M11 y M13.

### Asistencia (todas las categorías)

* **Asistencia** (menú; profe y admin; funciona sin señal): categoría, fecha y si es práctica o partido;
  "Todos presentes" y después se marcan los ausentes y justificados. Corregir el mismo día pisa la misma fila.
* **Asistencia %** = presentes / (presentes + ausentes); los justificados no cuentan. Se ve en el perfil del jugador
  (con las últimas faltas), en la página de la categoría (columna *Asist.*, en rojo debajo de 60 %) y en el resumen
  semanal. Alerta nueva: **faltó a las últimas 3 prácticas sin justificar**.
* Permisos (RLS): el profe la toma y corrige en sus categorías; el admin todo; el área médica sólo la ve. El jugador
  tiene que estar en esa categoría en la temporada. Es un registro básico del club: no pide consentimiento.

### Ficha de pase de categoría

* **Perfil del jugador → Ficha de pase** (cuerpo técnico): asistencia de la temporada, objetivos de la categoría,
  disponibilidad (lesiones y días fuera, sin diagnóstico) y **físico vs. la categoría siguiente** (o la que se elija,
  p. ej. Primera): su mejor marca de la temporada contra la mediana y el rango típico (25–75 %) de esa categoría, de su
  misma unidad (forwards/backs), con la mejora de la temporada. Sólo datos agregados (n ≥ 3); sin consentimiento de
  rendimiento no muestra datos físicos.
* **Recomendación** (profe de la categoría) y **decisión** (admin/coordinador): Sube / En observación / Se queda, con
  comentario, quién y cuándo. Tabla `promotion_reviews`; el trigger impide que el profe cargue la decisión.
* **Categoría → Pase de categoría**: todo el plantel con asistencia, tests en la mediana o mejor, recomendación y
  decisión, para la reunión de fin de año.
* La decisión queda registrada; el cambio de categoría se aplica al armar la temporada siguiente.

### Permisos por módulo

* **Admin → Usuarios**: buscador (nombre o email) y filtros por rol, estado, categoría y «con permisos restringidos»;
  vista *Lista* o *Permisos* (grilla usuarios × módulos). Los filtros quedan en la URL y se recuerdan al volver.
* **Admin → Usuarios → (usuario) → Permisos por módulo**: para cada módulo (Rendimiento, Bienestar, Asistencia,
  Objetivos, Lesiones, Pase de categoría, Resumen y alertas, Compartir) un nivel: **No ve · Ve · Carga**.
* **El rol define el máximo** (profe: todo en Carga; área médica: Rendimiento, Asistencia y Pase en Ve, Objetivos no,
  el resto Carga) y por usuario **sólo se restringe**. El admin siempre tiene todo. Sin restricciones = como antes.
* Se combina con las categorías asignadas y se aplica **en la base** (`private.can_view` / `private.can_edit` en las
  políticas RLS, benchmarks y funciones de compartir), no sólo en el menú. Tabla `user_module_permissions` (sólo
  guarda las restricciones; auditada). "Copiar permisos de…" y "Volver a los permisos del rol".
* No cambian: notas clínicas (área médica/admin), consentimientos, decisión de pase y Admin (sólo admin).

### Pase de temporada ("Aplicar pases")

* **Admin → Temporada → Aplicar pases** (o, con permiso, Categoría → Pase de categoría → *Aplicar pases a la temporada
  siguiente*). Con la temporada nueva ya creada (y todavía no actual): se elige la categoría y la temporada destino, y
  aparece el plantel con la categoría propuesta: la **decisión** de la ficha de pase (sube → su destino; se queda →
  misma categoría) o, sin decisión / en observación, la que le toca **por edad** (año de la temporada − año de
  nacimiento; si ya no entra en ninguna, plantel superior). Se puede cambiar cada fila o destildar jugadores.
* **Aplicar** pasa a todos juntos (`public.apply_promotions`, todo o nada) con el mismo puesto y sin camiseta; los que
  ya tienen categoría en la temporada destino no se tocan. Queda en la auditoría.
* Permiso: módulo **Pase de temporada**, apagado por defecto (sólo admin). El admin lo puede habilitar a un **profe**
  (sólo pasa jugadores de sus categorías); al área médica no.
* Después: asignar las categorías de los profes para la temporada nueva (Usuarios) y recién ahí marcarla como actual.

### Navegación

* Menú: **Inicio · Plantel · Asistencia · Evaluaciones** (+ Bienestar, Lesiones y Admin). En el celular la barra de abajo
  muestra las cuatro primeras y **Más** (Bienestar, Lesiones, Guía, Cerrar sesión).
* **Plantel** (`/plantel`): todos los jugadores de las categorías del usuario, con buscador (nombre o camiseta, sin
  importar acentos), categoría, forwards/backs, lesionados y sin consentimiento; acceso a la página de la categoría.
* **Menú de cuenta** (iniciales, arriba a la derecha): nombre, rol, tema claro/oscuro y **Cerrar sesión**.
* Nombres: "Cargar" → **Evaluaciones**; "Pase de categoría / Ficha de pase" → **Evaluación de pase**;
  "Pase de temporada" → **Armar temporada** (las URLs no cambian).

### Resumen de asistencia

* **Asistencia → "Ver resumen del mes y compartir"** (o Categoría → *Resumen de asistencia*), en `/asistencia`:
  categoría, período (este mes, mes anterior, temporada u otro rango) y prácticas/partidos. Muestra asistencia promedio,
  cantidad de prácticas y partidos, barras semana a semana y la tabla por jugador (de menor a mayor; en rojo < 60 %).
* **Sacarlo de la app**: texto para **WhatsApp**, **Excel** (hojas *Resumen* y *Detalle*) y **PDF** de una página con el
  escudo. Requiere el módulo Asistencia (ver) y Compartir (carga); cada exportación queda en `share_log`
  (`attendance_report`, vía `public.log_attendance_export`). Lleva nombres: uso interno del cuerpo técnico.
