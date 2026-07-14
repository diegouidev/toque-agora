/* Service worker do TOQUE AGORA (PWA).
 * Estratégia:
 *  - Navegação (HTML): network-first com fallback ao app shell em cache.
 *  - Assets estáticos (_next/static, ícones, manifest): stale-while-revalidate.
 *  - API e stream de áudio (/api/...): network-only, NUNCA cacheados.
 * Aumente a versão do cache para invalidar em deploys.
 */
const CACHE = "toque-agora-v2";
const APP_SHELL = "/";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

/* ---- Web Push: notificação de CD novo ---- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload não-JSON: usa defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "TOQUE AGORA", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        // Reusa uma janela aberta do app se houver; senão abre uma nova.
        for (const win of wins) {
          if ("focus" in win) {
            if ("navigate" in win) win.navigate(url).catch(() => {});
            return win.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só GET; mesma origem. Deixa POST/PUT e cross-origin passarem direto.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API e streaming de áudio: sempre rede, sem cache (respostas autenticadas + Range).
  if (url.pathname.startsWith("/api/")) return;

  // Navegação (documentos HTML): network-first, fallback ao app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(APP_SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(APP_SHELL))
        )
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res && res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
  }
});
