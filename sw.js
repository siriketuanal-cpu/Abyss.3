/* 深淵タイマー Service Worker — 静かな復帰最適化版 */
const CACHE_PREFIX = 'abyss2-game-split-';
const CACHE_NAME = 'abyss2-game-split-v34-abysss-final-v254';

const CORE_ASSETS = new Set([
  './',
  './index.html',
  './sw.js',
  './abysss-timer-model-v1.js?v=3',
  './abysss-core-v1.js?v=4',
  './styles-primary-v237.min.css?v=22',
  './styles-games-v237.min.css?v=20',
  './app-primary-v237.min.js?v=32',
  './games-deferred-v237.min.js?v=20',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
]);

const isCoreRequest = (request) => {
  const u = new URL(request.url);
  if (u.origin !== self.location.origin) return false;
  const key = u.pathname === new URL('./', self.location.origin).pathname
    ? './'
    : u.pathname + (u.search || '');
  return CORE_ASSETS.has(key);
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 更新時の大量の同時取得を避け、順番に更新する。
    for (const url of CORE_ASSETS) {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (_) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => { if(event.data?.type==='SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 通常のGETを全部SW経由にしない。
  // コア資産とナビゲーションだけを処理して、復帰時の余計なcache.matchを減らす。
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(async (cached) => {
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch (_) {
          return Response.error();
        }
      })
    );
    return;
  }

  if (!isCoreRequest(request)) return;

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
        return Response.error();
      }
    })
  );
});
