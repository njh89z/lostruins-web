// ui/render.js — GameState → 보드/손패/더미 DOM. 전체 재렌더(카드 ~60장, 충분히 가볍다).
// View는 상태를 읽기만 하고, 변경은 dispatch(intent)로만 요청(단방향, ADR-002).

import { SUITS } from '../core/cards.js';
import { canPlay } from '../core/rules.js';
import { scorePlayer } from '../core/rules.js';
import { el, cardEl, scoreTableEl, SUIT_META } from './components.js';
import { dealIn, pulse, overlayIn } from './animations.js';

/** 빌드 버전(우하단 배지). 배포(sw 캐시)와 함께 올린다 — 갱신 확인용 */
const BUILD = 'v22';

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
        onClick: () => dispatch({ type: 'openStartModal' }),
      }),
    ]),
    el('p', { className: `message${ui.aiThinking ? ' is-thinking' : ''}`, text: ui.message }),
  );

  // 중앙 데스크: 상단 제목·하단 손패를 제외한 남는 공간을 채운다(가로뷰 스크롤 방지)
  const desk = el('div', { className: 'desk' });
  root.append(desk);

  const drawPhase = myTurn && game.phase === 'draw';

  // ── 상대(PC) 탐험 밴드(상단, 박스 없음) — 중앙 박스에 붙어 위로 쌓임 ──
  const aiBand = el('div', { className: 'exp-band exp-band--ai' });
  aiBand.append(el('div', { className: 'deck-slot' })); // 덱 칸 자리 맞춤(빈칸)
  for (const suit of SUITS) {
    const aiStack = el('div', { className: 'stack stack--ai', dataset: { suit } });
    const aiExp = ai.expeditions[suit];
    for (let i = aiExp.length - 1; i >= 0; i -= 1) {
      const node = cardEl(aiExp[i]);
      node.style.zIndex = String(i + 1); // 최신(높은 index) 카드가 위로
      aiStack.append(node);
    }
    aiBand.append(aiStack);
  }
  desk.append(aiBand);

  // ── 중앙 박스: 드로우 덱 + 색별 버림 더미 ──
  const deckEl = el(
    'div',
    {
      className: `deck${drawPhase && game.deck.length ? ' is-target' : ''}${game.deck.length ? '' : ' is-empty'}`,
      onClick: drawPhase && game.deck.length ? () => dispatch({ type: 'drawFromDeck' }) : undefined,
      title: `덱 ${game.deck.length}장`,
    },
    [
      el('div', { className: 'deck__card' }, [el('span', { className: 'card__back', text: '◈' })]),
      el('span', { className: 'deck__count', text: `${game.deck.length}` }),
    ],
  );
  const center = el('div', { className: 'center' });
  center.append(deckEl);
  for (const suit of SUITS) {
    const pile = game.discards[suit];
    const isDiscardTarget = !!selected && selected.suit === suit;
    const isDrawTarget = drawPhase && pile.length > 0;
    const top = pile[pile.length - 1] || null;
    center.append(
      el(
        'div',
        {
          className: `pivot${isDiscardTarget || isDrawTarget ? ' is-target' : ''}${isDrawTarget ? ' is-draw' : ''}`,
          dataset: { suit },
          title: `${SUIT_META[suit].name} 버림 (${pile.length})`,
          onClick: () => {
            if (isDrawTarget) dispatch({ type: 'drawFromDiscard', suit });
            else if (isDiscardTarget) dispatch({ type: 'discardCard', cardId: selected.id });
          },
        },
        [
          top ? cardEl(top) : el('span', { className: 'pivot__empty', text: SUIT_META[suit].emoji }),
          pile.length > 1 ? el('span', { className: 'pivot__count', text: String(pile.length) }) : null,
        ],
      ),
    );
  }
  desk.append(center);

  // ── 내 탐험 밴드(하단, 박스 없음) — 중앙 박스에 붙어 아래로 쌓임 ──
  const meBand = el('div', { className: 'exp-band exp-band--me' });
  meBand.append(el('div', { className: 'deck-slot' })); // 덱 칸 자리 맞춤(빈칸)
  for (const suit of SUITS) {
    const canTarget = !!selected && selected.suit === suit && canPlay(human.expeditions[suit], selected);
    const meStack = el('div', {
      className: `stack stack--me${canTarget ? ' is-target' : ''}`,
      dataset: { suit },
      onClick: canTarget ? () => dispatch({ type: 'playCard', cardId: selected.id, suit }) : undefined,
    });
    for (const c of human.expeditions[suit]) meStack.append(cardEl(c));
    if (canTarget && human.expeditions[suit].length === 0) {
      meStack.append(el('span', { className: 'stack__hint', text: '여기' }));
    }
    meBand.append(meStack);
  }
  desk.append(meBand);

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

  // 마지막 카드 강조: 상대/내가 마지막에 처리한 카드 + 내가 마지막에 뽑은 카드
  for (const id of [ui.lastHuman, ui.lastAi, ui.lastDrawnHuman]) {
    if (!id) continue;
    const target = root.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    if (target) target.classList.add('is-last');
  }
  // 방금 일어난 행동은 한 번 반짝
  if (ui.lastAction?.cardId) {
    const target = root.querySelector(`[data-card-id="${CSS.escape(ui.lastAction.cardId)}"]`);
    if (target) pulse(target);
  }

  // ── 결과 오버레이 ──────────────────────────────────────
  if (game.status === 'finished') {
    root.append(resultOverlay(game, dispatch));
  }

  // ── 난이도 선택 모달(최상단) ───────────────────────────
  if (ui.showStartModal) {
    root.append(startModal(ui.difficulty, dispatch));
  }

  // 버전 배지(갱신 확인용)
  root.append(el('div', { className: 'build', text: BUILD }));
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
      onClick: () => dispatch({ type: 'openStartModal' }),
    }),
  ]);
  const overlay = el('div', { className: 'result' }, [panel]);
  overlayIn(panel);
  return overlay;
}

const DIFFICULTY_LABELS = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFFICULTY_DESC = {
  easy: '느긋하게 한 판',
  normal: '균형 잡힌 상대',
  hard: '수읽기로 강하게',
};

/** 난이도 선택 모달(첫 시작 / 새 게임 / 다시하기 때 표시) */
function startModal(current, dispatch) {
  const panel = el('div', { className: 'modal__panel' }, [
    el('h2', { className: 'modal__title', text: '난이도 선택' }),
    el('p', { className: 'modal__sub', text: '선택하면 새 게임이 시작됩니다' }),
  ]);
  for (const level of ['easy', 'normal', 'hard']) {
    panel.append(
      el('button', {
        className: `diff-card${current === level ? ' is-current' : ''}`,
        attrs: { type: 'button' },
        onClick: () => dispatch({ type: 'startGame', level }),
      }, [
        el('span', { className: 'diff-card__name', text: DIFFICULTY_LABELS[level] }),
        el('span', { className: 'diff-card__desc', text: DIFFICULTY_DESC[level] }),
      ]),
    );
  }
  // 배경 탭으로 닫기(이미 진행 중인 판으로 복귀)
  const overlay = el('div', {
    className: 'modal',
    onClick: (e) => {
      if (e.target === overlay) dispatch({ type: 'closeStartModal' });
    },
  }, [panel]);
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
