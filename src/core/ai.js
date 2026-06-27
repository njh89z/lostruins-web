// core/ai.js — 난이도별 결정적 AI (순수, 상태만으로 결정 / ADR-010).
//   easy   : 약한 휴리스틱(약한 색 남발 + 막판 규율 없음)
//   normal : 아레나 진화로 튜닝한 챔피언 휴리스틱(원본 대비 +58%)
//   hard   : normal 휴리스틱 + 공정한 결정적 롤아웃 탐색(미지 카드를 시드로 재배치)
// 모두 결정적(난수는 셔플/롤아웃 재배치의 시드 PRNG뿐, ADR-011).

import { SUITS, buildDeck, mulberry32 } from './cards.js';
import { canPlay, topNumber, hasNumber, scorePlayer } from './rules.js';
import { applyPlay, applyDiscard, applyDraw } from './game.js';

// ── 난이도별 휴리스틱 설정 ───────────────────────────────
// m2/m3/m4: 전개 카드 2/3/4장일 때의 신규 착수 최소 잠재합. wager: 투자 베팅 문턱.
// lateDeck: 남은 덱이 이 미만이면 신규 착수 금지(0=막판 규율 없음).
const NORMAL = { m2: 21, m3: 17, m4: 17, wager: 34, lateDeck: 8 };
const EASY = { m2: 15, m3: 13, m4: 12, wager: 28, lateDeck: 0 };
/** hard 롤아웃 표본 수(클수록 강하고 느림). 아레나 검증: K=40 → normal 대비 ~56%. */
const HARD_K = 40;

function sumNumbers(cards) {
  let s = 0;
  for (const c of cards) if (c.kind === 'number') s += c.value;
  return s;
}

function suitInfo(ps, suit) {
  const exp = ps.expeditions[suit];
  const top = topNumber(exp);
  const playableHeld = ps.hand
    .filter((c) => c.suit === suit && c.kind === 'number' && c.value > top)
    .sort((a, b) => a.value - b.value);
  const heldWagers = ps.hand.filter((c) => c.suit === suit && c.kind === 'wager');
  return {
    exp,
    top,
    committed: exp.length > 0,
    hasNum: hasNumber(exp),
    expSum: sumNumbers(exp),
    playableHeld,
    heldWagers,
    strength: sumNumbers(exp) + sumNumbers(playableHeld),
  };
}

/** 신규 착수할 만큼 유망한 색인가(자살 착수 회피 + 막판 억제) */
function isTarget(info, deckLen, cfg) {
  const ok =
    (info.strength >= cfg.m2 && info.playableHeld.length >= 2) ||
    (info.playableHeld.length >= 3 && info.strength >= cfg.m3) ||
    (info.playableHeld.length >= 4 && info.strength >= cfg.m4);
  if (!ok) return false;
  if (cfg.lateDeck > 0 && deckLen < cfg.lateDeck) return false; // 막판: 신규 착수 금지
  return true;
}

/** play 단계 휴리스틱 결정 */
export function choosePlay(state, cfg = NORMAL) {
  const ps = state.players[state.turn];
  const deckLen = state.deck.length;

  // 1) 착수한 탐험 키우기 (가장 많이 투자한 색 우선, 낮은 카드부터)
  let advance = null;
  for (const suit of SUITS) {
    const info = suitInfo(ps, suit);
    if (!info.committed) continue;
    let card = null;
    if (!info.hasNum && info.heldWagers.length > 0 && info.strength >= cfg.wager) {
      card = info.heldWagers[0];
    } else if (info.playableHeld.length > 0) {
      card = info.playableHeld[0];
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
    if (info.committed || !isTarget(info, deckLen, cfg)) continue;
    if (commit === null || info.strength > commit.strength) commit = info;
  }
  if (commit) {
    if (commit.heldWagers.length > 0 && commit.strength >= cfg.wager) {
      return { type: 'play', cardId: commit.heldWagers[0].id, suit: commit.heldWagers[0].suit };
    }
    const card = commit.playableHeld[0];
    return { type: 'play', cardId: card.id, suit: card.suit };
  }

  // 3) 버리기
  return { type: 'discard', cardId: chooseDiscardCard(ps, deckLen, cfg).id };
}

/** 버릴 카드 선택: 착수·유망색 카드는 보존, 나머지 중 낮은 숫자 우선 */
function chooseDiscardCard(ps, deckLen, cfg) {
  let bestCard = ps.hand[0];
  let bestRank = -Infinity;
  for (const c of ps.hand) {
    const info = suitInfo(ps, c.suit);
    let rank;
    if (info.committed && canPlay(info.exp, c)) rank = -1000;
    else if (!info.committed && isTarget(info, deckLen, cfg) && canPlay(info.exp, c)) rank = -500;
    else if (c.kind === 'wager') rank = 60;
    else rank = 20 - c.value;
    if (rank > bestRank) {
      bestRank = rank;
      bestCard = c;
    }
  }
  return bestCard;
}

/** draw 단계 휴리스틱 결정 */
export function chooseDraw(state, cfg = NORMAL) {
  const ps = state.players[state.turn];
  let pick = null;
  let pickScore = 0;
  for (const suit of SUITS) {
    const pile = state.discards[suit];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    const info = suitInfo(ps, suit);
    if (!canPlay(info.exp, top)) continue;
    if (!(info.committed || isTarget(info, state.deck.length, cfg))) continue;
    const wagersOn = info.exp.filter((c) => c.kind === 'wager').length;
    const s = top.kind === 'number' ? top.value * (1 + wagersOn) : 2;
    if (s > pickScore) {
      pickScore = s;
      pick = suit;
    }
  }
  if (pick) return { type: 'draw', from: 'discard', suit: pick };
  if (state.deck.length > 0) return { type: 'draw', from: 'deck' };
  for (const suit of SUITS) {
    if (state.discards[suit].length > 0) return { type: 'draw', from: 'discard', suit };
  }
  return { type: 'draw', from: 'deck' };
}

/** 한 설정(cfg)의 휴리스틱 행동 */
function heuristicMove(state, cfg) {
  return state.phase === 'play' ? choosePlay(state, cfg) : chooseDraw(state, cfg);
}

// ── hard: 공정한 결정적 롤아웃 탐색 ──────────────────────
const apply = (g, m) =>
  m.type === 'play' ? applyPlay(g, m.cardId) : m.type === 'discard' ? applyDiscard(g, m.cardId) : applyDraw(g, m);

/** 상태에서 안정적 해시(결정적 시드용) — 내 손패/공개정보만 사용(미래 미참조) */
function hashState(state, who) {
  let h = 2166136261 >>> 0;
  const fold = (s) => {
    for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  };
  for (const c of state.players[who].hand) fold(c.id);
  for (const suit of SUITS) {
    fold('D' + suit + state.discards[suit].length);
    fold('E' + state.players[who].expeditions[suit].length);
  }
  fold('k' + state.deck.length);
  return h >>> 0;
}

/** 미지 카드(상대 손패·덱)를 시드로 재배치한 가상 상태(공정: 실제 덱/상대패 미참조) */
function determinize(state, who, seed) {
  const opp = who === 'human' ? 'ai' : 'human';
  const seen = new Set();
  for (const c of state.players[who].hand) seen.add(c.id);
  for (const p of [state.players.human, state.players.ai]) {
    for (const suit of SUITS) for (const c of p.expeditions[suit]) seen.add(c.id);
  }
  for (const suit of SUITS) for (const c of state.discards[suit]) seen.add(c.id);

  const pool = buildDeck().filter((c) => !seen.has(c.id));
  const rng = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const oppHandSize = state.players[opp].hand.length;
  return {
    ...state,
    deck: pool.slice(oppHandSize),
    players: { ...state.players, [opp]: { ...state.players[opp], hand: pool.slice(0, oppHandSize) } },
  };
}

/** det 상태를 종료까지 normal 휴리스틱으로 진행 → who의 점수 마진 */
function rolloutMargin(detState, who) {
  let g = detState;
  let guard = 0;
  while (g.status === 'playing' && guard < 2000) {
    g = apply(g, heuristicMove(g, NORMAL));
    guard += 1;
  }
  return scorePlayer(g.players[who]).total - scorePlayer(g.players[who === 'human' ? 'ai' : 'human']).total;
}

/** hard 행동: play 단계는 후보 수들을 K회 결정적 롤아웃으로 평가, draw는 휴리스틱 */
function chooseHard(state, K) {
  if (state.phase !== 'play') return heuristicMove(state, NORMAL);
  const who = state.turn;
  const ps = state.players[who];

  const cands = [];
  for (const c of ps.hand) if (canPlay(ps.expeditions[c.suit], c)) cands.push({ type: 'play', cardId: c.id, suit: c.suit });
  const heur = heuristicMove(state, NORMAL); // 휴리스틱의 한 수(특히 버리기)도 후보에 포함
  if (heur.type === 'discard' || !cands.some((m) => m.cardId === heur.cardId)) cands.push(heur);
  if (cands.length === 1) return cands[0];

  const base = hashState(state, who);
  let best = null;
  for (const a of cands) {
    let total = 0;
    for (let k = 0; k < K; k += 1) {
      const det = determinize(state, who, (base + k * 2654435761) >>> 0);
      let g = apply(det, a);
      if (g.status === 'playing' && g.phase === 'draw') g = apply(g, heuristicMove(g, NORMAL));
      total += rolloutMargin(g, who);
    }
    const avg = total / K;
    if (best === null || avg > best.avg) best = { a, avg };
  }
  return best.a;
}

/**
 * 현재 단계·난이도에 맞는 AI 행동을 반환.
 * @param {GameState} state
 * @param {'easy'|'normal'|'hard'} [level]
 */
export function chooseMove(state, level = 'normal') {
  if (level === 'easy') return heuristicMove(state, EASY);
  if (level === 'hard') return chooseHard(state, HARD_K);
  return heuristicMove(state, NORMAL);
}
