// sw.js — 서비스워커. 앱 셸 precache(cache-first) + 폰트 런타임 캐시 (ADR-007).
// 갱신 시 CACHE 버전을 올려 강제 교체할 것.

const CACHE = 'lostruins-v18';

/** precache 대상(상대경로 — Pages 루트 /lostruins-web/) */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './styles/tokens.css',
  './styles/app.css',
  './src/main.js',
  './src/core/cards.js',
  './src/core/rules.js',
  './src/core/game.js',
  './src/core/ai.js',
  './src/app/store.js',
  './src/app/viewmodel.js',
  './src/ui/render.js',
  './src/ui/components.js',
  './src/ui/animations.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  if (sameOrigin) {
    // 앱 자산(HTML/JS/CSS): 네트워크 우선 → 배포 즉시 최신 반영, 실패 시 캐시(오프라인)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // cross-origin(폰트 등): 캐시 우선(런타임 캐시)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
