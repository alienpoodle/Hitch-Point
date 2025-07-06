const CACHE_NAME = 'hitch-point-cache-v1.3.1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/css/styles.css',
  '/src/js/main.js',
  '/src/js/firebase.js',
  '/src/js/auth.js',
  '/src/js/maps.js',
  '/src/js/ride.js',
  '/src/js/history.js',
  '/src/js/pwa.js',
  '/src/js/ui.js',
  '/src/js/constants.js',
  '/src/images/logo.png',

];

// Install event: cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(response => {
      return response || fetch(event.request);
    })
  );
});