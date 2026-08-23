/* 深淵タイマー Service Worker — 静かな更新版 */
/* CACHE_NAME は既存キャッシュを維持。更新時は新SWを待機させ、復帰時の即時切替を抑える。 */
const CACHE_PREFIX = 'abyss2-game-split-';
const CACHE_NAME = 'abyss2-game-split-v16-touch-overlay-final';

const CORE_ASSETS = [
  './',
  './index.html',
  './styles-primary-v237.min.css?v=16',
  './styles-games-v237.min.css?v=16',
  './app-primary-v237.min.js?v=16',
  './games-deferred-v237.min.js?v=16',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(CORE_ASSETS.map(async (url) => {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (_) {}
      }));
      // 意図的に skipWaiting() は呼ばない。
      // 新SWを待機させ、現在開いているPWAへの即時切替を避ける。
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      // clients.claim() も呼ばない。
      // 次回の通常起動時に新SWへ自然に切り替わる。
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        if (request.mode === 'navigate') {
          return (await caches.match('./index.html')) || Response.error();
        }
        return Response.error();
      }
    })
  );
});
