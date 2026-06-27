// ui/render.js — GameState → 보드/손패/더미 DOM. 전체 재렌더(카드 ~60장, 충분히 가볍다).
// View는 상태를 읽기만 하고, 변경은 dispatch(intent)로만 요청(단방향, ADR-002).

import { SUITS } from '../core/cards.js';
import { canPlay } from '../core/rules.js';
import { scorePlayer } from '../core/rules.js';
import { el, cardEl, expeditionColumnEl, discardPileEl, scoreTableEl, SUIT_META } from './components.js';
import { dealIn, pulse, overlayIn } from './animations.js';

/**
 * @param {HTMLElement} root
 * @param {AppState} appState
 * @param {(intent:object)=>void} dispatch
 */
export function render(root, appState, dispatch) {
  const { game, ui } = appState;
  const human = game.players.human;
  const ai = game.players.ai;
  const myTurn = game.turn === 'human' && game.status === 'playing' && !ui.aiThinking;
  const selected = myTurn && game.phase === 'play' ? human.hand.find((c) => c.id === ui.selectedCardId) : null;

  root.replaceChildren();

  // ── 헤더 ──────────────────────────────────────────────
  root.append(
    el('header', { className: 'topbar' }, [
      el('h1', { className: 'topbar__logo', text: 'LOSTRUINS' }),
      el('button', {
        className: 'btn btn--ghost',
        text: '새 게임',
        attrs: { type: 'button' },
        onClick: () => dispatch({ type: 'newGame' }),
      }),
    ]),
    el('p', { className: `message${ui.aiThinking ? ' is-thinking' : ''}`, text: ui.message }),
  );

  // ── 상대(AI) 탐험 요약 ─────────────────────────────────
  const aiRow = el('section', { className: 'exp-row exp-row--ai', attrs: { 'aria-label': '상대 탐험' } });
  aiRow.append(el('span', { className: 'exp-row__tag', text: 'PC' }));
  const aiCols = el('div', { className: 'exp-row__cols' });
  for (const suit of SUITS) aiCols.append(expeditionColumnEl(suit, ai.expeditions[suit], { compact: true }));
  aiRow.append(aiCols);
  root.append(aiRow);

  // ── 공용 영역: 덱 + 버림 더미 ──────────────────────────
  const drawPhase = myTurn && game.phase === 'draw';
  const board = el('section', { className: 'board' });

  const deck = el('div', {
    className: `deck${drawPhase && game.deck.length ? ' is-target' : ''}${game.deck.length ? '' : ' is-empty'}`,
    onClick: drawPhase && game.deck.length ? () => dispatch({ type: 'drawFromDeck' }) : undefined,
    title: `덱 ${game.deck.length}장`,
  });
  deck.append(
    el('div', { className: 'deck__card' }, [el('span', { className: 'card__back', text: '◈' })]),
    el('span', { className: 'deck__count', text: `${game.deck.length}` }),
  );
  board.append(deck);

  const discardRow = el('div', { className: 'discards' });
  for (const suit of SUITS) {
    const isDiscardTarget = selected && selected.suit === suit; // play단계: 선택카드 버리기 대상
    const isDrawTarget = drawPhase && game.discards[suit].length > 0;
    discardRow.append(
      discardPileEl(suit, game.discards[suit], {
        target: isDiscardTarget || isDrawTarget,
        onClick: () => {
          if (isDrawTarget) dispatch({ type: 'drawFromDiscard', suit });
          else if (isDiscardTarget) dispatch({ type: 'discardCard', cardId: selected.id });
        },
      }),
    );
  }
  board.append(discardRow);
  root.append(board);

  // ── 내 탐험 5열 (선택 카드의 합법 내기 대상 하이라이트) ──
  const myRow = el('section', { className: 'exp-row exp-row--me', attrs: { 'aria-label': '내 탐험' } });
  myRow.append(el('span', { className: 'exp-row__tag', text: '나' }));
  const myCols = el('div', { className: 'exp-row__cols' });
  for (const suit of SUITS) {
    const canTarget = selected && selected.suit === suit && canPlay(human.expeditions[suit], selected);
    myCols.append(
      expeditionColumnEl(suit, human.expeditions[suit], {
        highlight: !!canTarget,
        onClick: canTarget ? () => dispatch({ type: 'playCard', cardId: selected.id, suit }) : undefined,
      }),
    );
  }
  myRow.append(myCols);
  root.append(myRow);

  // ── 내 손패 ────────────────────────────────────────────
  const handWrap = el('section', { className: 'hand' });
  const handInner = el('div', { className: 'hand__cards' });
  const sorted = human.hand.slice().sort(handOrder);
  const animate = [];
  for (const c of sorted) {
    const playable = myTurn && game.phase === 'play' && canPlay(human.expeditions[c.suit], c);
    const node = cardEl(c, {
      selected: ui.selectedCardId === c.id,
      playable,
      dimmed: !!selected && selected.id !== c.id,
      onClick: myTurn && game.phase === 'play' ? () => dispatch({ type: 'selectCard', cardId: c.id }) : undefined,
    });
    handInner.append(node);
    animate.push(node);
  }
  handWrap.append(handInner);

  // 행동 힌트
  if (selected) {
    const canHere = canPlay(human.expeditions[selected.suit], selected);
    handWrap.append(
      el('p', {
        className: 'hand__hint',
        text: canHere
          ? `${SUIT_META[selected.suit].name} 열을 탭해 내기, 또는 ${SUIT_META[selected.suit].name} 더미에 버리기`
          : `이 카드는 낼 수 없어요 — ${SUIT_META[selected.suit].name} 더미에 버리기`,
      }),
    );
  }
  root.append(handWrap);

  // 손패 등장 애니메이션(턴 시작 느낌)
  animate.forEach((n, i) => dealIn(n, i * 18));

  // 방금 행동 강조
  if (ui.lastAction?.cardId) {
    const target = root.querySelector(`[data-card-id="${ui.lastAction.cardId}"]`);
    if (target) pulse(target);
  }

  // ── 결과 오버레이 ──────────────────────────────────────
  if (game.status === 'finished') {
    root.append(resultOverlay(game, dispatch));
  }
}

function resultOverlay(game, dispatch) {
  const hs = scorePlayer(game.players.human);
  const as = scorePlayer(game.players.ai);
  const verdict = hs.total > as.total ? '승리!' : hs.total < as.total ? '패배' : '무승부';
  const verdictClass = hs.total > as.total ? 'is-win' : hs.total < as.total ? 'is-lose' : 'is-draw';

  const panel = el('div', { className: `result__panel ${verdictClass}` }, [
    el('h2', { className: 'result__verdict', text: verdict }),
    el('p', { className: 'result__score', text: `${hs.total} : ${as.total}` }),
    scoreTableEl(hs, as),
    el('button', {
      className: 'btn btn--primary',
      text: '다시하기',
      attrs: { type: 'button' },
      onClick: () => dispatch({ type: 'newGame' }),
    }),
  ]);
  const overlay = el('div', { className: 'result' }, [panel]);
  overlayIn(panel);
  return overlay;
}

/** 손패 정렬: 색(SUITS 순) → 투자 먼저 → 숫자 오름차순 */
function handOrder(a, b) {
  const sa = SUITS.indexOf(a.suit);
  const sb = SUITS.indexOf(b.suit);
  if (sa !== sb) return sa - sb;
  if (a.kind !== b.kind) return a.kind === 'wager' ? -1 : 1;
  return a.value - b.value;
}
