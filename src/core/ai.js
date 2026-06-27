// core/ai.js — 결정적 휴리스틱 AI (순수, 상태만으로 결정 / ADR-010)
// 발상은 구버전 playAI2 계승(기술상세 §4.1): 유적별 cnt/sum/diff 집계 →
// "유망한 1~2색을 정해 보존·착수하고, 착수한 색은 낮은 카드부터 매 턴 키운다".
// 손실 회피(약한 색 착수·약한 색 투자 회피)가 핵심.

import { SUITS } from './cards.js';
import { canPlay, topNumber, hasNumber } from './rules.js';

// 착수 문턱(시뮬레이션 튜닝: 평균 +12, 착수 탐험의 ~75%가 흑자, 빈손 게임 0).
// 너무 낮으면 약한 색에 -20을 남발하고, 너무 높으면 소극적이 된다.
/** 잠재 합이 이만큼이면 착수(전개 카드 2장 이상). */
const COMMIT_MIN_SUM = 21;
/** 카드가 3장 이상 모인 색은 다소 낮은 합에서도 착수(전개할 시간이 충분). */
const COMMIT_MIN_SUM_3 = 19;
/** 카드가 4장 이상이면 합이 더 낮아도 착수(폭으로 8장 보너스·합 확보). */
const COMMIT_MIN_SUM_4 = 17;
/** 투자 카드를 걸/쌓을 만큼 분명히 강한 색의 잠재 합. */
const WAGER_MIN_SUM = 34;

function sumNumbers(cards) {
  let s = 0;
  for (const c of cards) if (c.kind === 'number') s += c.value;
  return s;
}

/**
 * 한 색의 현재 포지션 + 손패 잠재를 요약.
 * @param {PlayerState} ps
 * @param {string} suit
 */
function suitInfo(ps, suit) {
  const exp = ps.expeditions[suit];
  const top = topNumber(exp);
  const committed = exp.length > 0;
  const hasNum = hasNumber(exp);
  const expSum = sumNumbers(exp);
  // 아직 합법적으로 낼 수 있는 손패 숫자(오름차순 보장 위해 value>top), 낮은 값부터
  const playableHeld = ps.hand
    .filter((c) => c.suit === suit && c.kind === 'number' && c.value > top)
    .sort((a, b) => a.value - b.value);
  const heldNumbers = ps.hand.filter((c) => c.suit === suit && c.kind === 'number');
  const heldWagers = ps.hand.filter((c) => c.suit === suit && c.kind === 'wager');
  // 잠재 합 = 이미 낸 숫자 + 앞으로 낼 수 있는 손패 숫자
  const strength = expSum + sumNumbers(playableHeld);
  return { exp, top, committed, hasNum, expSum, playableHeld, heldNumbers, heldWagers, strength };
}

/** 신규 착수할 만큼 유망한 색인가(자살 착수 회피) */
function isTarget(info) {
  if (info.strength >= COMMIT_MIN_SUM && info.playableHeld.length >= 2) return true;
  if (info.playableHeld.length >= 3 && info.strength >= COMMIT_MIN_SUM_3) return true;
  if (info.playableHeld.length >= 4 && info.strength >= COMMIT_MIN_SUM_4) return true;
  return false;
}

/**
 * play 단계 결정.
 *  1) 이미 착수한 색이 있으면 — 그 색을 낮은 카드부터 키운다(카드 수·합·8장 보너스 극대화).
 *  2) 아니면 가장 강한 미착수 유망색에 착수(강하면 투자 먼저, 아니면 가장 낮은 숫자).
 *  3) 둘 다 없으면 가장 쓸모없는 카드를 버린다.
 */
export function choosePlay(state) {
  const ps = state.players[state.turn];

  // 1) 착수한 탐험 키우기 (가장 많이 투자한 색 우선)
  let advance = null;
  for (const suit of SUITS) {
    const info = suitInfo(ps, suit);
    if (!info.committed) continue;
    let card = null;
    if (!info.hasNum && info.heldWagers.length > 0 && info.strength >= WAGER_MIN_SUM) {
      card = info.heldWagers[0]; // 숫자 내기 전 + 강한 색이면 투자 카드를 더 쌓는다
    } else if (info.playableHeld.length > 0) {
      card = info.playableHeld[0]; // 낮은 숫자부터(잠금 회피)
    }
    if (card && (advance === null || info.expSum > advance.expSum)) {
      advance = { card, expSum: info.expSum };
    }
  }
  if (advance) return { type: 'play', cardId: advance.card.id, suit: advance.card.suit };

  // 2) 가장 강한 미착수 유망색에 신규 착수
  let commit = null;
  for (const suit of SUITS) {
    const info = suitInfo(ps, suit);
    if (info.committed || !isTarget(info)) continue;
    if (commit === null || info.strength > commit.info.strength) commit = { info };
  }
  if (commit) {
    const info = commit.info;
    if (info.heldWagers.length > 0 && info.strength >= WAGER_MIN_SUM) {
      return { type: 'play', cardId: info.heldWagers[0].id, suit: info.heldWagers[0].suit };
    }
    const card = info.playableHeld[0];
    return { type: 'play', cardId: card.id, suit: card.suit };
  }

  // 3) 버리기
  return { type: 'discard', cardId: chooseDiscardCard(ps).id };
}

/** 버릴 카드 선택: 착수·유망색 카드는 보존, 나머지 중 낮은 숫자(상대에게 덜 이로움) 우선 */
function chooseDiscardCard(ps) {
  let bestCard = ps.hand[0];
  let bestRank = -Infinity;
  for (const c of ps.hand) {
    const info = suitInfo(ps, c.suit);
    let rank;
    if (info.committed && canPlay(info.exp, c)) {
      rank = -1000; // 착수한 탐험에 낼 카드 — 반드시 보존
    } else if (!info.committed && isTarget(info) && canPlay(info.exp, c)) {
      rank = -500; // 유망한 신규 탐험 후보 — 보존
    } else if (c.kind === 'wager') {
      rank = 60; // 죽은 색의 투자 카드 — 순수 낭비, 가장 먼저 버림
    } else {
      rank = 20 - c.value; // 낮은 숫자일수록 버리기 안전
    }
    if (rank > bestRank) {
      bestRank = rank;
      bestCard = c;
    }
  }
  return bestCard;
}

/** draw 단계 결정: 착수·유망색에 즉시 유효한 버림 더미 카드 우선, 아니면 덱 */
export function chooseDraw(state) {
  const ps = state.players[state.turn];
  let pick = null;
  let pickScore = 0;
  for (const suit of SUITS) {
    const pile = state.discards[suit];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    const info = suitInfo(ps, suit);
    if (!canPlay(info.exp, top)) continue;
    if (!(info.committed || isTarget(info))) continue;
    const wagersOn = info.exp.filter((c) => c.kind === 'wager').length;
    const s = top.kind === 'number' ? top.value * (1 + wagersOn) : 2;
    if (s > pickScore) {
      pickScore = s;
      pick = suit;
    }
  }
  if (pick) return { type: 'draw', from: 'discard', suit: pick };
  if (state.deck.length > 0) return { type: 'draw', from: 'deck' };
  // 덱 소진 폴백(정상 흐름에선 도달하지 않음)
  for (const suit of SUITS) {
    if (state.discards[suit].length > 0) return { type: 'draw', from: 'discard', suit };
  }
  return { type: 'draw', from: 'deck' };
}

/** 현재 단계에 맞는 AI 행동을 반환 */
export function chooseMove(state) {
  return state.phase === 'play' ? choosePlay(state) : chooseDraw(state);
}
