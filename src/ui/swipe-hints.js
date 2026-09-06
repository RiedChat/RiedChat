// ===================== ui/swipe-hints.js =====================
// Иконки-подсказки по краям пузыря во время свайпа (появление, позиция,
// прогресс-анимация). Выделено из swipe-gesture.js: чистая работа с
// hint-элементами, не знает про pointer-события и dx/dy напрямую.

function makeHint(cls, glyph){
  const el = document.createElement('div');
  el.className = 'swipe-hint ' + cls;
  el.textContent = glyph;
  return el;
}

// Создаёт пару подсказок (left/right), позиционирует их один раз
// относительно исходного места пузыря в строке (у row должен быть
// position:relative) и добавляет в row. Возвращает {leftHint, rightHint}.
export function createSwipeHints(row, bubble, leftGlyph, rightGlyph){
  const leftHint = makeHint('reply-hint', leftGlyph);
  const rightHint = makeHint('action-hint', rightGlyph);
  leftHint.style.left = (bubble.offsetLeft + bubble.offsetWidth + 6) + 'px';
  rightHint.style.left = (bubble.offsetLeft - 38) + 'px';
  row.appendChild(leftHint);
  row.appendChild(rightHint);
  return {leftHint, rightHint};
}

// Обновляет прозрачность/масштаб подсказок по текущему сдвигу d
// относительно порога срабатывания trigger.
export function updateSwipeHints(hints, d, trigger){
  const progress = Math.min(1, Math.abs(d) / trigger);
  const scale = 0.6 + 0.4 * progress;
  if(d < 0){
    hints.leftHint.style.opacity = progress;
    hints.leftHint.style.transform = 'translateY(-50%) scale(' + scale + ')';
    hints.rightHint.style.opacity = 0;
  } else if(d > 0){
    hints.rightHint.style.opacity = progress;
    hints.rightHint.style.transform = 'translateY(-50%) scale(' + scale + ')';
    hints.leftHint.style.opacity = 0;
  } else {
    hints.leftHint.style.opacity = 0;
    hints.rightHint.style.opacity = 0;
  }
}

export function removeSwipeHints(hints){
  if(!hints) return;
  if(hints.leftHint) hints.leftHint.remove();
  if(hints.rightHint) hints.rightHint.remove();
}

