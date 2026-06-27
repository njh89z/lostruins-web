// core/cards.js — 60장 덱 정의 + 시드 기반 셔플 (순수, DOM 무관)
// ADR-011: 셔플은 시드 PRNG(mulberry32) + Fisher–Yates. Math.random 미사용.

/** 유적(색) 식별자 — 표시 순서이자 결정적 순회 순서 */
export const SUITS = ['desert', 'snow', 'volcano', 'jungle', 'abyss'];

export const NUMBER_MIN = 2;        // 숫자 카드 최소값
export const NUMBER_MAX = 10;       // 숫자 카드 최대값
export const WAGERS_PER_SUIT = 3;   // 색당 투자 카드 수

/**
 * 결정적 PRNG. seed(32bit) → [0,1) 난수 생성기.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 정렬된(미셔플) 60장 덱을 생성한다.
 * 유적당: 숫자 2..10(9장) + 투자 3장 = 12장. 5색 = 60장.
 * @returns {Card[]}
 */
export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let v = NUMBER_MIN; v <= NUMBER_MAX; v++) {
      deck.push({ id: `${suit}-${v}`, suit, kind: 'number', value: v });
    }
    for (let w = 1; w <= WAGERS_PER_SUIT; w++) {
      deck.push({ id: `${suit}-w${w}`, suit, kind: 'wager', value: 0 });
    }
  }
  return deck;
}

/**
 * 시드로 결정적 셔플(원본 불변, 새 배열 반환).
 * @param {Card[]} deck
 * @param {number} seed
 * @returns {Card[]}
 */
export function shuffle(deck, seed) {
  const rng = mulberry32(seed);
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
