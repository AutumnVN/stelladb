self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            await self.clients.claim();
            const cacheNames = await caches.keys();
            return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        })()
    );
});
