// sw.js — 서비스워커. 앱 셸 precache(cache-first) + 폰트 런타임 캐시 (ADR-007).
// 갱신 시 CACHE 버전을 올려 강제 교체할 것.

const CACHE = 'lostruins-v1';

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

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // 폰트 등 cross-origin 포함, 성공 응답은 런타임 캐시에 추가
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached); // 오프라인: 캐시에 없으면 실패
    }),
  );
});
