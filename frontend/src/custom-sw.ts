/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Workbox precaching (auto-injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching strategies
registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({ cacheName: 'google-fonts', plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })] }),
);

registerRoute(
  /\/api\/auth\/me$/,
  new NetworkFirst({ cacheName: 'auth-cache', plugins: [new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 })], networkTimeoutSeconds: 3 }),
);

registerRoute(
  /\/api\/(session-types|class-groups|features)$/,
  new StaleWhileRevalidate({ cacheName: 'reference-data', plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 })] }),
);

registerRoute(
  /\/api\/sessions/,
  new NetworkFirst({ cacheName: 'sessions-cache', plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })], networkTimeoutSeconds: 3 }),
);

registerRoute(
  /\/api\/my-rsvps/,
  new NetworkFirst({ cacheName: 'rsvps-cache', plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 })], networkTimeoutSeconds: 3 }),
);

registerRoute(
  /\/api\/my-children/,
  new NetworkFirst({ cacheName: 'children-cache', plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 })], networkTimeoutSeconds: 3 }),
);

registerRoute(
  /\/api\/announcements/,
  new StaleWhileRevalidate({ cacheName: 'announcements-cache', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 4 })] }),
);

registerRoute(
  /\/api\/.*/i,
  new NetworkFirst({ cacheName: 'api-cache', plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 })] }),
);

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'WLPC', {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Click notification → open app to the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});
