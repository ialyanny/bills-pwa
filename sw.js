/**
 * Service Worker：離線可用。
 * 策略：自家檔案「網路優先、失敗才用快取」（確保改版立即生效，離線仍可開）；
 *       Supabase API 完全不快取；第三方 CDN 先快取、背景更新。
 */
const CACHE_VERSION = 'bills-v2';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/logic.js',
  './js/seed.js',
  './js/store.js',
  './js/sync.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('precache 失敗', err)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase API 一律走網路，不進快取
  if (url.hostname.endsWith('supabase.co')) return;

  // 第三方 CDN（supabase-js）：先給快取、背景更新
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        const fetching = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fetching;
      }),
    );
    return;
  }

  // 自家檔案：網路優先，離線時退回快取
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('離線且沒有快取', { status: 503, statusText: 'Offline' });
      }),
  );
});
