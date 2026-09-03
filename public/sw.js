// ICS Service Worker for PWA support & background network resiliency
const CACHE_NAME = 'ics-crm-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for assets, bypass Supabase/API requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }
  // Let network handle real-time requests with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
