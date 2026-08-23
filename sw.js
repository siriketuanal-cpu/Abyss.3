/* 深淵タイマー Service Worker — 起動性能最適化版 */
/* 公開時にindex.htmlまたは静的ファイルを更新したら CACHE_NAME を上げる。 */
const CACHE_PREFIX = 'abyss2-game-split-';
const CACHE_NAME = 'abyss2-game-split-v16-touch-overlay-final';

// 起動に必須の最小アプリシェル。アイコンは公開先に置く前提。
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
      // 失敗した1ファイルでアプリシェル全体の更新を止めない。
      await Promise.all(CORE_ASSETS.map(async (url) => {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (_) {}
      }));
      await self.skipWaiting();
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
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // アプリシェルはキャッシュ優先で返し、オンライン起動時の余計な再取得を避ける。
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
        // ナビゲーション要求だけは、キャッシュ済みのアプリ本体へフォールバックする。
        if (request.mode === 'navigate') {
          return (await caches.match('./index.html')) || Response.error();
        }
        return Response.error();
      }
    })
  );
});
