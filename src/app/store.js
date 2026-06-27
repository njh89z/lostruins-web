// app/store.js — 최소 옵저버블 스토어 (프레임워크 대체, ADR-003)
// 상태를 보관·통지만 한다. 게임 룰은 모른다.

/**
 * @template T
 * @param {T} initial
 * @returns {{getState:()=>T, setState:(next:T|((s:T)=>T))=>void, subscribe:(fn:(s:T)=>void)=>()=>void}}
 */
export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();

  return {
    getState() {
      return state;
    },
    setState(next) {
      state = typeof next === 'function' ? next(state) : next;
      for (const fn of subscribers) fn(state);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
