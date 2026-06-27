// core/ai.js — 결정적 휴리스틱 AI (순수, 상태만으로 결정 / ADR-010)
// 발상은 구버전 playAI2 계승(기술상세 §4.1): 유적별 cnt/sum/diff 집계 →
// 착수 유적 우선 · 합 큰 것 우선 · 신규 착수는 신중. 손실 회피가 핵심.

import { SUITS } from './cards.js';
import { canPlay, topNumber, EXPEDITION_COST } from './rules.js';

/** 신규 착수를 허용할 최소 잠재 합(이보다 낮으면 -20 회수 가망 없음) */
const COMMIT_MIN_SUM = 24;
/** 신규 착수에 필요한 최소 잠재 카드 수(전개할 시간) */
const COMMIT_MIN_CARDS = 2;
/** 투자 카드를 걸기 위한 강한 잠재 합 */
const WAGER_MIN_SUM = 34;

function sumNumbers(cards) {
  let s = 0;
  for (const c of cards) if (c.kind === 'number') s += c.value;
  return s;
}

/**
 * 한 색에 대한 잠재 평가(현재 열 + 손패의 아직 낼 수 있는 숫자들).
 * @param {PlayerState} ps
 * @param {string} suit
 */
function projection(ps, suit) {
  const exp = ps.expeditions[suit];
  const top = topNumber(exp);
  const placedWagers = exp.filter((c) => c.kind === 'wager').length;
  const committed = exp.length > 0;
  const handPlayables = ps.hand.filter(
    (c) => c.suit === suit && c.kind === 'number' && c.value > top,
  );
  const projSum = sumNumbers(exp) + sumNumbers(handPlayables);
  const projCount = exp.length + handPlayables.length;
  return { exp, placedWagers, committed, handPlayables, projSum, projCount };
}

/** 새로 착수할 만한 색인가(자살 착수 회피) */
function worthCommitting(proj) {
  return proj.projSum >= COMMIT_MIN_SUM && proj.handPlayables.length >= COMMIT_MIN_CARDS;
}

/**
 * 카드 c를 내는 행동의 점수(null = 두지 말 것).
 * 착수한 탐험을 키우는 수는 항상 양수(합이 늘면 (합-20)×배수가 커짐).
 */
function playScore(card, proj) {
  if (card.kind === 'wager') {
    // 투자: 숫자 내기 전 + 분명히 강한 색에만 베팅
    if (proj.projSum >= WAGER_MIN_SUM && proj.handPlayables.length >= 3) return 3;
    return null;
  }
  if (proj.committed) {
    // 이미 착수: 더 큰 숫자를 얹는 건 항상 이득
    return card.value * (1 + proj.placedWagers) + (proj.projCount >= 8 ? 5 : 0);
  }
  // 신규 착수: 회수 가망 있을 때만
  if (worthCommitting(proj)) return proj.projSum - EXPEDITION_COST;
  return null;
}

/** 버릴 카드 선택: 쓸모없는 색의 낮은 카드 우선(상대에게 큰 카드 안 넘김) */
function chooseDiscardCard(ps) {
  let bestCard = ps.hand[0];
  let bestRank = -Infinity;
  for (const c of ps.hand) {
    const proj = projection(ps, c.suit);
    let rank;
    if (proj.committed && canPlay(proj.exp, c)) {
      rank = -1000; // 착수한 탐험에 쓸 카드 — 보존
    } else if (worthCommitting(proj) && canPlay(proj.exp, c)) {
      rank = -500; // 유망한 신규 탐험 후보 — 보존
    } else if (c.kind === 'wager') {
      rank = 50; // 죽은 색의 투자 카드 — 순수 낭비, 가장 먼저 버림
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

/** play 단계 결정: 가장 좋은 내기 수 또는 버리기 */
export function choosePlay(state) {
  const ps = state.players[state.turn];
  let best = null;
  for (const c of ps.hand) {
    const proj = projection(ps, c.suit);
    if (!canPlay(proj.exp, c)) continue;
    const score = playScore(c, proj);
    if (score !== null && (best === null || score > best.score)) {
      best = { score, action: { type: 'play', cardId: c.id, suit: c.suit } };
    }
  }
  if (best && best.score > 0) return best.action;
  return { type: 'discard', cardId: chooseDiscardCard(ps).id };
}

/** draw 단계 결정: 즉시 유효한 버림 더미 카드 우선, 아니면 덱 */
export function chooseDraw(state) {
  const ps = state.players[state.turn];
  let pick = null;
  let pickScore = 0;
  for (const suit of SUITS) {
    const pile = state.discards[suit];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    const exp = ps.expeditions[suit];
    if (!canPlay(exp, top)) continue;
    const proj = projection(ps, suit);
    if (!(proj.committed || worthCommitting(proj))) continue;
    const s = top.kind === 'number' ? top.value * (1 + proj.placedWagers) : 2;
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
