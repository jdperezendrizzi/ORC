// Service worker de ORC Rendimiento.
//
// * Estáticos de Next (/_next/static, íconos): cache-first (tienen hash).
// * Navegación (HTML): network-first. Sin señal: la copia guardada de las
//   páginas de cancha (/, /cargar, /bienestar, /practica, /lesiones/nueva) y la guía,
//   o si no hay, /offline.
//   Los perfiles de jugadores y la lista de lesiones NO se guardan en el dispositivo.
// * Las llamadas a Supabase NO pasan por acá: los datos offline viven en
//   IndexedDB y se sincronizan desde la app (outbox).
//
// Para que /cargar y /bienestar funcionen sin señal hay que abrirlas una vez
// con señal (quedan guardadas). La app las precarga después del login.

const VERSION = "orc-v9";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const PRECACHE_PAGES = ["/offline"];
const OFFLINE_PAGES = [
  "/",
  "/cargar",
  "/bienestar",
  "/practica",
  "/lesiones/nueva",
  "/guia",
  "/tests",
  "/tests/cmj",
  "/tests/cmj-semanal",
  "/tests/sprint",
  "/tests/ift",
  "/tests/reaccion",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((c) => c.addAll(PRECACHE_PAGES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      // Sin clients.claim(): tomar el control de una página que se está
      // cargando provocaba errores de hidratación. Controla desde la
      // próxima navegación (las páginas de cancha se guardan igual).
      .then(() => undefined),
  );
});

// La app pide precargar las páginas de cancha cuando hay sesión iniciada.
self.addEventListener("message", (event) => {
  if (event.data?.type === "PRECACHE_FIELD_PAGES") {
    event.waitUntil(
      caches.open(PAGES_CACHE).then((cache) =>
        Promise.all(
          OFFLINE_PAGES.map((url) =>
            fetch(url, { credentials: "same-origin" })
              .then((res) => (res.ok && !res.redirected ? cache.put(url, res) : undefined))
              .catch(() => undefined),
          ),
        ),
      ),
    );
  }
  if (event.data?.type === "CLEAR_PAGES") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/crest.png" || url.pathname === "/logo.svg") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Sólo se guardan las páginas de cancha (no perfiles con datos de
          // menores), y nunca redirecciones (p.ej. a /login) ni errores.
          if (res.ok && !res.redirected && OFFLINE_PAGES.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/offline")) || Response.error()),
    );
  }
});
