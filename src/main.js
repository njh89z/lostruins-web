// main.js — 부트스트랩: store · viewmodel · view 연결 + 서비스워커 등록.

import { createStore } from './app/store.js';
import { createViewModel, initialAppState } from './app/viewmodel.js';
import { render } from './ui/render.js';

const root = document.getElementById('app');

const store = createStore(initialAppState('normal', true)); // 첫 실행: 난이도 선택 모달
const viewModel = createViewModel(store);

// 상태 변화 시 재렌더(단방향 흐름)
store.subscribe((state) => render(root, state, viewModel.dispatch));

// 최초 렌더
render(root, store.getState(), viewModel.dispatch);

// PWA: 서비스워커 등록(상대경로 — Pages 루트가 /lostruins-web/)
if ('serviceWorker' in navigator) {
  // 새 워커가 제어권을 가져오면(=배포 갱신) 한 번 자동 새로고침 → 옛 캐시 잔존 방지.
  // 최초 설치(이전 컨트롤러 없음) 때는 새로고침하지 않는다.
  let refreshing = false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW 등록 실패:', err);
    });
  });
}
