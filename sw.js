// Service worker : l'application reste utilisable sans connexion.
// Réseau d'abord (les mises à jour arrivent seules), cache en secours.
const CACHE = 'enquetes-v1';
const FICHIERS = ['./', 'index.html', 'app.js', 'questions.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(r)
      .then(res => {
        const copie = res.clone();
        caches.open(CACHE).then(c => c.put(r, copie));
        return res;
      })
      .catch(() => caches.match(r).then(x => x || caches.match('index.html')))
  );
});
