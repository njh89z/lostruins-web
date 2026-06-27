// ui/animations.js — Web Animations API 시각 효과만(없어도 게임 동작엔 영향 없음).

/** WAAPI 미지원/테스트 환경 가드 */
function canAnimate(node) {
  return node && typeof node.animate === 'function';
}

/** 손패 카드 등장 — 살짝 위로 떠오르며 페이드인 */
export function dealIn(node, delay = 0) {
  if (!canAnimate(node)) return;
  node.animate(
    [
      { opacity: 0, transform: 'translateY(12px) scale(0.96)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    { duration: 260, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
  );
}

/** 방금 일어난 행동 강조 — 골드 글로우 펄스 */
export function pulse(node) {
  if (!canAnimate(node)) return;
  node.animate(
    [
      { boxShadow: '0 0 0 0 rgba(200,162,75,0.0)' },
      { boxShadow: '0 0 0 6px rgba(200,162,75,0.45)' },
      { boxShadow: '0 0 0 0 rgba(200,162,75,0.0)' },
    ],
    { duration: 620, easing: 'ease-out' },
  );
}

/** 결과 오버레이 등장 */
export function overlayIn(node) {
  if (!canAnimate(node)) return;
  node.animate(
    [
      { opacity: 0, transform: 'scale(0.96)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
}
