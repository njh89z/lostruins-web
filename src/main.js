// main.js — 부트스트랩: store · viewmodel · view 연결 + 서비스워커 등록.

import { createStore } from './app/store.js';
import { createViewModel, initialAppState } from './app/viewmodel.js';
import { render } from './ui/render.js';

const root = document.getElementById('app');

const store = createStore(initialAppState());
const viewModel = createViewModel(store);

// 상태 변화 시 재렌더(단방향 흐름)
store.subscribe((state) => render(root, state, viewModel.dispatch));

// 최초 렌더
render(root, store.getState(), viewModel.dispatch);

// PWA: 서비스워커 등록(상대경로 — Pages 루트가 /lostruins-web/)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW 등록 실패:', err);
    });
  });
}
