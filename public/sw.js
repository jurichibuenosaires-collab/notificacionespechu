self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Nuevo pedido', {
      body: data.body || 'Entrá a la app para ver el detalle',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [300, 100, 300, 100, 500],
      requireInteraction: true, // No desaparece hasta que la toquen
      tag: 'nuevo-pedido',
      renotify: true,
      actions: [
        { action: 'open', title: 'Ver pedido' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('notificacionespechu') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('https://notificacionespechu.vercel.app');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
