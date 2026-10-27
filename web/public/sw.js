// Service worker mínimo para que el navegador ofrezca instalar la app.
// No guarda nada en caché: todo sigue viniendo de la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
