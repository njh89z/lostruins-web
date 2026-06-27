// ui/components.js — 순수 DOM 팩토리 (카드·버튼·점수표). 상태/스토어 미참조.

import { SUITS } from '../core/cards.js';

/** 유적 표시 메타(이모지·한글명) — 색은 CSS 토큰(data-suit)로 */
export const SUIT_META = {
  desert: { emoji: '🏜️', name: '사막' },
  snow: { emoji: '🏔️', name: '설산' },
  volcano: { emoji: '🌋', name: '화산' },
  jungle: { emoji: '🌿', name: '정글' },
  abyss: { emoji: '🌊', name: '심해' },
};

/**
 * 작은 DOM 헬퍼.
 * @param {string} tag
 * @param {object} [props] className/text/dataset/onclick/attrs
 * @param {(Node|string)[]} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text != null) node.textContent = props.text;
  if (props.html != null) node.innerHTML = props.html;
  if (props.dataset) {
    for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  }
  if (props.onClick) node.addEventListener('click', props.onClick);
  if (props.title) node.title = props.title;
  for (const c of children) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * 카드 DOM.
 * @param {Card} card
 * @param {object} [opts] {selected, playable, dimmed, onClick, faceDown}
 */
export function cardEl(card, opts = {}) {
  const classes = ['card', `card--${card.kind}`];
  if (opts.selected) classes.push('is-selected');
  if (opts.playable) classes.push('is-playable');
  if (opts.dimmed) classes.push('is-dimmed');
  if (opts.faceDown) classes.push('is-facedown');

  const label = card.kind === 'wager' ? '⟡' : String(card.value);
  const node = el('button', {
    className: classes.join(' '),
    dataset: { suit: card.suit, cardId: card.id, kind: card.kind },
    onClick: opts.onClick,
    attrs: { type: 'button' },
    title: `${SUIT_META[card.suit].name} ${card.kind === 'wager' ? '투자' : card.value}`,
  });
  if (opts.faceDown) {
    node.append(el('span', { className: 'card__back', text: '◈' }));
    return node;
  }
  node.append(
    el('span', { className: 'card__corner card__corner--tl', text: label }),
    el('span', { className: 'card__emoji', text: SUIT_META[card.suit].emoji }),
    el('span', { className: 'card__corner card__corner--br', text: label }),
  );
  return node;
}

/** 탐험 열(미니/풀). cards 순서대로 겹쳐 표시 */
export function expeditionColumnEl(suit, cards, opts = {}) {
  const col = el('div', {
    className: `exp-col${opts.compact ? ' exp-col--compact' : ''}${opts.highlight ? ' is-target' : ''}`,
    dataset: { suit },
    onClick: opts.onClick,
  });
  col.append(el('span', { className: 'exp-col__icon', text: SUIT_META[suit].emoji }));
  const stack = el('div', { className: 'exp-col__stack' });
  for (const c of cards) {
    stack.append(
      el('span', {
        className: `chip chip--${c.kind}`,
        dataset: { suit, cardId: c.id },
        text: c.kind === 'wager' ? '⟡' : String(c.value),
      }),
    );
  }
  col.append(stack);
  return col;
}

/** 버림 더미(맨 위 카드만 보이게) */
export function discardPileEl(suit, pile, opts = {}) {
  const top = pile[pile.length - 1] || null;
  const node = el('div', {
    className: `discard${opts.target ? ' is-target' : ''}${pile.length ? '' : ' is-empty'}`,
    dataset: { suit },
    onClick: opts.onClick,
    title: `${SUIT_META[suit].name} 버림 (${pile.length}장)`,
  });
  if (top) {
    node.append(cardEl(top, { faceDown: false }));
  } else {
    node.append(el('span', { className: 'discard__placeholder', text: SUIT_META[suit].emoji }));
  }
  if (pile.length > 1) node.append(el('span', { className: 'discard__count', text: String(pile.length) }));
  return node;
}

/** 점수 분해 표(결과 화면) */
export function scoreTableEl(humanScore, aiScore) {
  const table = el('table', { className: 'score-table' });
  const head = el('tr', {}, [
    el('th', { text: '유적' }),
    el('th', { text: '나' }),
    el('th', { text: 'PC' }),
  ]);
  table.append(el('thead', {}, [head]));
  const body = el('tbody');
  for (const suit of SUITS) {
    body.append(
      el('tr', {}, [
        el('td', {}, [
          el('span', { className: 'score-suit', dataset: { suit }, text: SUIT_META[suit].emoji }),
          ` ${SUIT_META[suit].name}`,
        ]),
        el('td', { className: scoreClass(humanScore.breakdown[suit]), text: fmt(humanScore.breakdown[suit]) }),
        el('td', { className: scoreClass(aiScore.breakdown[suit]), text: fmt(aiScore.breakdown[suit]) }),
      ]),
    );
  }
  table.append(body);
  table.append(
    el('tfoot', {}, [
      el('tr', { className: 'score-total' }, [
        el('th', { text: '합계' }),
        el('td', { className: scoreClass(humanScore.total), text: fmt(humanScore.total) }),
        el('td', { className: scoreClass(aiScore.total), text: fmt(aiScore.total) }),
      ]),
    ]),
  );
  return table;
}

function fmt(n) {
  return n > 0 ? `+${n}` : String(n);
}
function scoreClass(n) {
  if (n > 0) return 'is-pos';
  if (n < 0) return 'is-neg';
  return 'is-zero';
}
