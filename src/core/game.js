// core/game.js — 게임 상태머신 (불변 전이, 순수)
// ADR-003: 입력 상태를 변경하지 않고 새 GameState를 반환한다.

import { SUITS, buildDeck, shuffle } from './cards.js';
import { canPlay, HAND_SIZE } from './rules.js';

/** 색별 빈 배열 객체({desert:[], ...}) */
function emptySuitMap() {
  const m = {};
  for (const s of SUITS) m[s] = [];
  return m;
}

/** 색별 배열을 얕게 복제(각 배열도 새 배열) */
function cloneSuitMap(map) {
  const out = {};
  for (const s of SUITS) out[s] = map[s].slice();
  return out;
}

/** 빈 플레이어 상태 */
function emptyPlayer() {
  return { hand: [], expeditions: emptySuitMap() };
}

/**
 * 새 게임 생성. 60장을 시드 셔플 → 8장씩 교대로 분배.
 * 덱의 맨 위 = 인덱스 0.
 * @param {number} seed
 * @returns {GameState}
 */
export function newGame(seed) {
  const deck = shuffle(buildDeck(), seed);
  const human = emptyPlayer();
  const ai = emptyPlayer();
  let i = 0;
  for (let n = 0; n < HAND_SIZE; n += 1) {
    human.hand.push(deck[i]);
    i += 1;
    ai.hand.push(deck[i]);
    i += 1;
  }
  return {
    deck: deck.slice(i),
    discards: emptySuitMap(),
    players: { human, ai },
    turn: 'human',
    phase: 'play',
    pending: null,
    status: 'playing',
    rngState: seed,
  };
}

/** 현재 플레이어 손패에서 카드 찾기(없으면 throw) */
function takeCard(playerState, cardId) {
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card) throw new Error(`card not in hand: ${cardId}`);
  return card;
}

/**
 * ① 카드를 탐험 열에 낸다. → phase 'draw'.
 * @param {GameState} state
 * @param {string} cardId
 * @returns {GameState}
 */
export function applyPlay(state, cardId) {
  if (state.phase !== 'play') throw new Error('not in play phase');
  const who = state.turn;
  const ps = state.players[who];
  const card = takeCard(ps, cardId);
  if (!canPlay(ps.expeditions[card.suit], card)) {
    throw new Error(`illegal play: ${cardId} on ${card.suit}`);
  }
  const expeditions = cloneSuitMap(ps.expeditions);
  expeditions[card.suit] = expeditions[card.suit].concat([card]);
  const hand = ps.hand.filter((c) => c.id !== cardId);
  return {
    ...state,
    players: { ...state.players, [who]: { hand, expeditions } },
    phase: 'draw',
    pending: { type: 'played', by: who, card, suit: card.suit },
  };
}

/**
 * ① 카드를 해당 색 버림 더미에 버린다. → phase 'draw'.
 * @param {GameState} state
 * @param {string} cardId
 * @returns {GameState}
 */
export function applyDiscard(state, cardId) {
  if (state.phase !== 'play') throw new Error('not in play phase');
  const who = state.turn;
  const ps = state.players[who];
  const card = takeCard(ps, cardId);
  const discards = cloneSuitMap(state.discards);
  discards[card.suit] = discards[card.suit].concat([card]);
  const hand = ps.hand.filter((c) => c.id !== cardId);
  return {
    ...state,
    players: { ...state.players, [who]: { ...ps, hand } },
    discards,
    phase: 'draw',
    pending: { type: 'discarded', by: who, card, suit: card.suit },
  };
}

/**
 * ② 카드 1장을 뽑는다. 덱 맨 위 또는 임의 색 버림 더미 맨 위.
 * 뽑은 뒤 덱이 비면 게임 종료(그 턴이 마지막). 아니면 턴 교대 + phase 'play'.
 * @param {GameState} state
 * @param {{from:'deck'} | {from:'discard', suit:string}} source
 * @returns {GameState}
 */
export function applyDraw(state, source) {
  if (state.phase !== 'draw') throw new Error('not in draw phase');
  const who = state.turn;
  const ps = state.players[who];

  let deck = state.deck;
  let discards = state.discards;
  let drawn;

  if (source.from === 'deck') {
    if (deck.length === 0) throw new Error('deck is empty');
    drawn = deck[0];
    deck = deck.slice(1);
  } else if (source.from === 'discard') {
    const pile = state.discards[source.suit];
    if (!pile || pile.length === 0) throw new Error(`discard empty: ${source.suit}`);
    drawn = pile[pile.length - 1];
    discards = cloneSuitMap(state.discards);
    discards[source.suit] = discards[source.suit].slice(0, -1);
  } else {
    throw new Error('invalid draw source');
  }

  const hand = ps.hand.concat([drawn]);
  const over = deck.length === 0;
  return {
    ...state,
    deck,
    discards,
    players: { ...state.players, [who]: { ...ps, hand } },
    turn: over ? who : who === 'human' ? 'ai' : 'human',
    phase: 'play',
    pending: { type: 'drew', by: who, card: drawn, from: source.from },
    status: over ? 'finished' : 'playing',
  };
}
