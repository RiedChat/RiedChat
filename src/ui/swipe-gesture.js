// ===================== ui/swipe-gesture.js =====================
// Универсальный свайп по строке списка (как в Telegram), без семантики чата: только геометрия жеста через Pointer Events (touch/mouse/pen). Константы и селектор интерактивных элементов - swipeConfig, иконки-подсказки рисует CSS (css/messages.css, .msg-row[data-dir]). Смысл свайпа - в features/message-swipe/wire.js, сюда передаются колбэки.

// Константы геометрии и селектор интерактивных элементов, с которых свайп не стартует (используют features/message-edit и message-select).
export const swipeConfig = {
  TRIGGER: 62,   // px - сдвиг, после которого жест засчитывается
  CAP: 84,       // px - визуальный предел сдвига пузыря
  AXIS_LOCK: 8,  // px - до этого жест не начинается (вертикальный скролл у касаний отдаёт браузеру touch-action:pan-y на .msg-row)

  // Элементы, с которых свайп не стартует. setPointerCapture берётся не на pointerdown, а когда ось определена как горизонтальная (onPointerMove), поэтому остались только мелкие controls, где ожидание движения съело бы первый тап (play/pause, «на весь экран»). 'a' и 'video' убраны: они занимают всю площадь медиа-вложения и блокировали свайп прямо на медиа (riedchat bug report, п.2).
  INTERACTIVE_SEL: '.voice-play, .track-play, .track-download, .track-bar, ' +
    '.media-expand-btn, .video-tap-load, button, input, textarea',
};

const { TRIGGER, CAP, AXIS_LOCK, INTERACTIVE_SEL } = swipeConfig;

// wire(container, rowSelector, opts) - вешает жест на container (делегирование через closest(rowSelector), для '.msg-row').
// opts:
//   getItem(row) -> владелец строки или null (жест игнорируется)
//   leftHintGlyph(row, item)  -> иконка свайпа влево (по умолчанию '↩')
//   rightHintGlyph(row, item) -> иконка свайпа вправо (по умолчанию '⧉')
//   onSwipeLeft(item, bubble)  -> свайп справа налево
//   onSwipeRight(item, bubble) -> свайп слева направо
//   bubbleSelector -> селектор пузыря в строке (по умолчанию '.bubble')
export function wireSwipeGesture(container, rowSelector, opts){
  if(!container) return;
  const bubbleSelector = opts.bubbleSelector || '.bubble';
  let g = null; // активный жест: {row, bubble, item, pointerId, x0, y0, active, dx}

  // Событие принадлежит текущему жесту (тот же указатель).
  const mine = e => g && e.pointerId === g.pointerId;

  function cleanup(){
    if(!g) return;
    g.bubble.style.transition = 'transform .2s ease';
    g.bubble.style.transform = '';
    if(g.row.hasPointerCapture(g.pointerId)) g.row.releasePointerCapture(g.pointerId);
    g.row.removeAttribute('data-dir');
    g = null;
  }

  function onPointerDown(e){
    if(g) return; // жест уже идёт другим указателем - игнорируем
    if(e.button) return; // правая/доп. кнопка мыши - не жест
    if(e.target.closest?.(INTERACTIVE_SEL)) return; // не перехватываем клики по кнопкам/ссылкам/плееру
    // Ловим нажатие по всей ширине строки: свайп можно начать и справа/слева от узкого пузыря.
    const row = e.target.closest?.(rowSelector);
    if(!row) return;
    const bubble = row.querySelector(bubbleSelector);
    if(!bubble) return;
    const item = opts.getItem(row);
    if(!item) return;
    g = {
      row, bubble, item, pointerId: e.pointerId,
      x0: e.clientX, y0: e.clientY, active: false, dx: 0,
    };
    // setPointerCapture здесь не берём: захват перенаправляет click на row вместо реального target, и обычный тап по видео/ссылке на фото ломался бы. Откладываем до onPointerMove - когда жест точно горизонтальный.
  }

  function onPointerMove(e){
    if(!mine(e)) return;
    const dx = e.clientX - g.x0;

    if(!g.active){
      // Касание, ушедшее в вертикальный скролл, браузер отменяет сам (pointercancel). Мышь: преобладающий сдвиг по вертикали жестом не считается.
      if(Math.abs(dx) < AXIS_LOCK || Math.abs(dx) < Math.abs(e.clientY - g.y0)) return;
      g.active = true;
      // Захват только теперь: жест точно горизонтальный (не скролл и не тап, см. onPointerDown) - move/up приходят независимо от траектории, а клик по медиа без сдвига работает как обычно.
      g.row.setPointerCapture(e.pointerId);
      // Иконки-подсказки - ::before/::after у .msg-row (css/messages.css): глиф из data-атрибутов, позиция у краёв пузыря из --hint-*.
      g.row.dataset.leftGlyph = opts.leftHintGlyph?.(g.row, g.item) ?? '↩';
      g.row.dataset.rightGlyph = opts.rightHintGlyph?.(g.row, g.item) ?? '⧉';
      g.row.style.setProperty('--hint-reply', (g.bubble.offsetLeft + g.bubble.offsetWidth + 6) + 'px');
      g.row.style.setProperty('--hint-action', (g.bubble.offsetLeft - 38) + 'px');
    }

    const abs = Math.abs(dx);
    // лёгкое «сопротивление» за порогом, затем предел CAP
    const d = Math.sign(dx) * Math.min(CAP, abs > TRIGGER ? TRIGGER + (abs - TRIGGER) * 0.35 : abs);
    g.dx = d;
    g.bubble.style.transition = 'none';
    g.bubble.style.transform = 'translateX(' + d + 'px)';

    g.row.dataset.dir = d < 0 ? 'left' : 'right';
    g.row.style.setProperty('--swipe-p', Math.min(1, Math.abs(d) / TRIGGER));
  }

  function onPointerUp(e){
    if(!mine(e)) return;
    const { dx, item, bubble, active } = g;
    if(active && Math.abs(dx) >= TRIGGER) opts[dx < 0 ? 'onSwipeLeft' : 'onSwipeRight']?.(item, bubble);
    cleanup();
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  // браузер перехватил жест (системный скролл/навигация) - гасим
  container.addEventListener('pointercancel', (e) => { if(mine(e)) cleanup(); });
}
