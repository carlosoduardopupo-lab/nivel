// Service worker de Blurry: permite instalar la app y muestra las notificaciones push.
// No guarda nada en caché: todo sigue viniendo de la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Push de Firebase Cloud Messaging (mensajes solo de datos: titulo, texto, url).
self.addEventListener("push", (e) => {
  let d = {};
  try {
    const j = e.data ? e.data.json() : {};
    d = j.data || j;
  } catch {
    d = { texto: e.data ? e.data.text() : "" };
  }
  e.waitUntil(self.registration.showNotification(d.titulo || "Blurry", {
    body: d.texto || "",
    icon: "/icono-192.png",
    badge: "/icono-192.png",
    tag: d.tipo || "blurry",
    renotify: true,
    data: { url: d.url || "/" },
  }));
});

// Al tocarla: abre Blurry (o la trae al frente) en la pantalla del aviso.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abiertas) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        return c.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});
