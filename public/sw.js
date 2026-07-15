// Service worker: instalación como PWA + recepción de recordatorios.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Recordatorio enviado desde el servidor, funciona con la app cerrada.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "Enfoque", {
      body: d.body || "Te falta algo del día.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "enfoque-recordatorio",   // reemplaza la anterior en vez de apilar
      renotify: true,
      data: { url: "/" },
    })
  );
});

// Al tocar la notificación: enfoca la ventana abierta o abre la app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
