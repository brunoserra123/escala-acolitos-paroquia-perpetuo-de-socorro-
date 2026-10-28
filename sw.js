// Service Worker para Escala Perpétuo de Socorro (PWA)
const CACHE_NAME = 'escala-socorro-v1.3.0';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // Deixa chamadas ao Supabase e ao version.json irem direto para a rede
    const url = event.request.url;
    if (url.includes('supabase.co') || url.includes('version.json')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => response)
            .catch(() => caches.match(event.request))
    );
});