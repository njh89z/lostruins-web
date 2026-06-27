// core/rules.js — 합법 수 판정 + 점수 계산 + 종료 판정 (순수, 테스트 대상)
// 기획서 2.3/2.5 충실. 룰 임의 변경 금지(ADR-009).

import { SUITS } from './cards.js';

/** 점수 상수 (기술상세 §2) */
export const EXPEDITION_COST = 20; // 착수 비용(음수로 적용)
export const BONUS_CARDS = 8;      // 보너스 도달 장수
export const BONUS_POINTS = 20;    // 8장 이상 보너스
export const HAND_SIZE = 8;        // 손패 유지 장수

/**
 * 한 탐험 열에 놓인 가장 높은 숫자 카드 값(없으면 0).
 * 카드는 오름차순으로만 쌓이므로 이는 "마지막 숫자"이기도 하다.
 * @param {Card[]} expedition
 * @returns {number}
 */
export function topNumber(expedition) {
  let top = 0;
  for (const c of expedition) {
    if (c.kind === 'number' && c.value > top) top = c.value;
  }
  return top;
}

/** 탐험 열에 숫자 카드가 하나라도 놓였는가 */
export function hasNumber(expedition) {
  return expedition.some((c) => c.kind === 'number');
}

/**
 * 카드를 해당 색 탐험 열에 낼 수 있는가?
 *  - 투자(wager): 그 색에 숫자 카드를 내기 전에만(여러 장 가능).
 *  - 숫자(number): 직전 최고 숫자보다 커야 함(오름차순, 동값 불가).
 * @param {Card[]} expedition  해당 색 자기 탐험 열
 * @param {Card} card
 * @returns {boolean}
 */
export function canPlay(expedition, card) {
  if (card.kind === 'wager') return !hasNumber(expedition);
  return card.value > topNumber(expedition);
}

/**
 * 한 탐험(색)의 점수.
 * (숫자 합 − 20) × (1 + 투자 수) + (총 8장 이상이면 +20).
 * 착수하지 않은(빈) 탐험은 0점(감점 없음).
 * @param {Card[]} cards
 * @returns {number}
 */
export function scoreExpedition(cards) {
  if (cards.length === 0) return 0;
  let sum = 0;
  let wagers = 0;
  for (const c of cards) {
    if (c.kind === 'wager') wagers += 1;
    else sum += c.value;
  }
  let score = (sum - EXPEDITION_COST) * (1 + wagers);
  if (cards.length >= BONUS_CARDS) score += BONUS_POINTS;
  return score;
}

/**
 * 한 플레이어의 총점 + 색별 분해.
 * @param {PlayerState} playerState
 * @returns {{ total: number, breakdown: Record<string, number> }}
 */
export function scorePlayer(playerState) {
  let total = 0;
  const breakdown = {};
  for (const suit of SUITS) {
    const s = scoreExpedition(playerState.expeditions[suit]);
    breakdown[suit] = s;
    total += s;
  }
  return { total, breakdown };
}

/** 드로우 덱이 바닥나면 종료 */
export function isGameOver(state) {
  return state.deck.length === 0;
}

/**
 * 현재 플레이어가 둘 수 있는 합법 수 요약(UI 하이라이트용).
 *  - play 단계: 카드별 낼 수 있는 색(자기 색에 한해) / 버리기는 항상 가능
 *  - draw 단계: 덱 가능 여부 + 가져올 수 있는 버림 더미 색
 * @param {GameState} state
 * @returns {object}
 */
export function legalMoves(state) {
  const ps = state.players[state.turn];
  if (state.phase === 'play') {
    const playable = {}; // cardId -> suit (낼 수 있으면)
    for (const c of ps.hand) {
      if (canPlay(ps.expeditions[c.suit], c)) playable[c.id] = c.suit;
    }
    return { phase: 'play', playable, canDiscard: true };
  }
  const drawDiscards = SUITS.filter((s) => state.discards[s].length > 0);
  return { phase: 'draw', canDrawDeck: state.deck.length > 0, drawDiscards };
}
