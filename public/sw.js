// VaultDrop service worker: makes the app installable and lets the shell and toolkit work offline.
// Network-first, so users always get the current code when online. API calls and secrets are never cached.
const CACHE = 'vaultdrop-shell-v1';
const SHELL = [
  '/', '/style.css', '/favicon.svg', '/manifest.webmanifest',
  '/js/theme.js', '/js/app.js', '/js/ui.js', '/js/crypto.js', '/js/tools.js',
  '/vendor/qrcode.js', '/vendor/eff-wordlist.json',
  '/fonts/inter-latin-wght-normal.woff2', '/fonts/space-grotesk-latin-wght-normal.woff2', '/fonts/jetbrains-mono-latin-wght-normal.woff2',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = e.request.mode === 'navigate' ? '/' : url.pathname;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && SHELL.includes(key)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(key).then((hit) => hit || Response.error())),
  );
});
