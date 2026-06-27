// app/viewmodel.js — intent 해석 + 턴/단계 진행 + AI 자동 실행 (타이머는 여기서만)
// 앱 상태 = { game: GameState, ui: {...} }. core는 game만 다루고, ui는 여기서 관리.

import { newGame, applyPlay, applyDiscard, applyDraw } from '../core/game.js';
import { chooseMove } from '../core/ai.js';

/** AI 행동 간 딜레이(ms) — 무엇을 했는지 보이게 */
const AI_PLAY_DELAY = 650;
const AI_DRAW_DELAY = 650;

/** 새 게임용 시드 — Math.random은 app 계층에서만(core는 시드만 받음, ADR-011) */
function freshSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** 유효 난이도 목록 */
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

/** 초기 앱 상태 (난이도 유지 + 시작 모달 표시 여부) */
export function initialAppState(difficulty = 'normal', showStartModal = false) {
  return {
    game: newGame(freshSeed()),
    ui: {
      selectedCardId: null,
      aiThinking: false,
      message: '내 차례 — 카드를 선택하세요',
      lastAction: null, // {by, type, suit, cardId} 애니메이션 힌트
      lastHuman: null, // 내가 마지막에 처리한(낸/버린) 카드 id — 하이라이트
      lastAi: null, // 상대가 마지막에 처리한 카드 id — 하이라이트
      lastDrawnHuman: null, // 내가 마지막에 뽑아온 카드 id — 하이라이트
      difficulty, // 'easy' | 'normal' | 'hard'
      showStartModal, // 난이도 선택 모달
    },
  };
}

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 */
export function createViewModel(store) {
  /** game 전이 + ui 패치를 한 번에 반영 */
  function update(gameProducer, uiPatch) {
    store.setState((s) => ({
      game: gameProducer ? gameProducer(s.game) : s.game,
      ui: { ...s.ui, ...uiPatch },
    }));
  }

  function humanMessage(game) {
    if (game.status === 'finished') return '게임 종료 — 점수를 확인하세요';
    if (game.turn !== 'human') return '상대(PC) 차례…';
    return game.phase === 'play'
      ? '내 차례 — 낼 카드를 선택하세요'
      : '뽑기 — 덱 또는 버림 더미에서 1장';
  }

  /** 인간 턴 종료 후(draw 완료) AI 차례면 자동 실행 */
  function maybeRunAi() {
    const { game } = store.getState();
    if (game.status === 'finished') {
      update(null, { aiThinking: false, message: humanMessage(game), selectedCardId: null });
      return;
    }
    if (game.turn !== 'ai') {
      update(null, { aiThinking: false, message: humanMessage(game), selectedCardId: null });
      return;
    }
    update(null, { aiThinking: true, message: '상대(PC)가 생각 중…', selectedCardId: null });
    setTimeout(runAiPlay, AI_PLAY_DELAY);
  }

  function runAiPlay() {
    const { game, ui } = store.getState();
    if (game.turn !== 'ai' || game.phase !== 'play') return;
    const move = chooseMove(game, ui.difficulty);
    const next =
      move.type === 'play' ? applyPlay(game, move.cardId) : applyDiscard(game, move.cardId);
    update(() => next, {
      lastAction: { by: 'ai', type: move.type, suit: next.pending?.suit, cardId: move.cardId },
      lastAi: move.cardId,
      message: move.type === 'play' ? '상대가 탐험에 카드를 냈습니다' : '상대가 카드를 버렸습니다',
    });
    setTimeout(runAiDraw, AI_DRAW_DELAY);
  }

  function runAiDraw() {
    const { game, ui } = store.getState();
    if (game.turn !== 'ai' || game.phase !== 'draw') return;
    const move = chooseMove(game, ui.difficulty);
    const next = applyDraw(game, move);
    update(() => next, {
      lastAction: { by: 'ai', type: 'draw', from: move.from, suit: move.suit },
      message: move.from === 'deck' ? '상대가 덱에서 뽑았습니다' : '상대가 버림 더미에서 가져갔습니다',
    });
    // 다음 턴(인간) 또는 종료
    maybeRunAi();
  }

  /** 인간 입력 디스패치 */
  function dispatch(intent) {
    const { game, ui } = store.getState();

    switch (intent.type) {
      case 'openStartModal':
        update(null, { showStartModal: true, selectedCardId: null });
        return;

      case 'closeStartModal':
        update(null, { showStartModal: false });
        return;

      case 'startGame': {
        // 모달에서 난이도 선택 → 그 난이도로 새 판 시작
        const level = DIFFICULTIES.includes(intent.level) ? intent.level : ui.difficulty;
        store.setState(initialAppState(level, false));
        return;
      }

      case 'newGame':
        store.setState(initialAppState(ui.difficulty)); // 난이도 유지(즉시 새 판)
        return;

      case 'selectCard': {
        if (game.turn !== 'human' || game.phase !== 'play') return;
        const next = ui.selectedCardId === intent.cardId ? null : intent.cardId;
        update(null, { selectedCardId: next });
        return;
      }

      case 'playCard': {
        if (game.turn !== 'human' || game.phase !== 'play') return;
        const next = applyPlay(game, intent.cardId);
        update(() => next, {
          selectedCardId: null,
          lastAction: { by: 'human', type: 'play', suit: next.pending?.suit, cardId: intent.cardId },
          lastHuman: intent.cardId,
          message: humanMessage(next),
        });
        return;
      }

      case 'discardCard': {
        if (game.turn !== 'human' || game.phase !== 'play') return;
        const next = applyDiscard(game, intent.cardId);
        update(() => next, {
          selectedCardId: null,
          lastAction: { by: 'human', type: 'discard', suit: next.pending?.suit, cardId: intent.cardId },
          lastHuman: intent.cardId,
          message: humanMessage(next),
        });
        return;
      }

      case 'drawFromDeck': {
        if (game.turn !== 'human' || game.phase !== 'draw' || game.deck.length === 0) return;
        const next = applyDraw(game, { from: 'deck' });
        update(() => next, {
          lastAction: { by: 'human', type: 'draw', from: 'deck' },
          lastDrawnHuman: next.pending?.card?.id ?? null,
          message: humanMessage(next),
        });
        maybeRunAi();
        return;
      }

      case 'drawFromDiscard': {
        if (game.turn !== 'human' || game.phase !== 'draw') return;
        if (game.discards[intent.suit].length === 0) return;
        const next = applyDraw(game, { from: 'discard', suit: intent.suit });
        update(() => next, {
          lastAction: { by: 'human', type: 'draw', from: 'discard', suit: intent.suit },
          lastDrawnHuman: next.pending?.card?.id ?? null,
          message: humanMessage(next),
        });
        maybeRunAi();
        return;
      }

      default:
        // 알 수 없는 intent는 무시(불법 수 차단은 UI에서 비활성으로 처리)
        return;
    }
  }

  return { dispatch };
}
