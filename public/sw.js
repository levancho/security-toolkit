// VaultDrop service worker: makes the app installable and lets the shell and toolkit work offline.
// Network-first, so users always get the current code when online. API calls and secrets are never cached.
const CACHE = 'vaultdrop-shell-v2';
const SHELL = [
  '/', '/app.css', '/favicon.svg', '/manifest.webmanifest',
  '/js/theme.js', '/js/app.js', '/js/ui.js', '/js/crypto.js', '/js/tools.js',
  '/vendor/qrcode.js', '/vendor/eff-wordlist.json',
  '/colibri/css/colibri.css', '/colibri/themes/colibri.css', '/colibri/css/colibri-ui-bridge.css',
  '/colibri/core/ai.js', '/colibri/core/application-component.js', '/colibri/core/application-shell.js', '/colibri/core/auto.js', '/colibri/core/base.js', '/colibri/core/blocks.js', '/colibri/core/button-group.js', '/colibri/core/calendar.js', '/colibri/core/charts.js', '/colibri/core/checkbox.js', '/colibri/core/collapsible.js', '/colibri/core/dialog.js', '/colibri/core/extras.js', '/colibri/core/form-data.js', '/colibri/core/forms.js', '/colibri/core/listbox.js', '/colibri/core/menu.js', '/colibri/core/motion.js', '/colibri/core/navigation.js', '/colibri/core/popover.js', '/colibri/core/registry.js', '/colibri/core/tabs.js', '/colibri/core/toggle.js', '/colibri/core/util.js',
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
