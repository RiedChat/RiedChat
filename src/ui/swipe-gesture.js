// ===================== ui/swipe-gesture.js =====================
// Универсальная механика "свайп по строке списка, как в Telegram", без
// привязки к семантике чата - только геометрия жеста через Pointer Events
// (единая модель для touch/mouse/pen). Константы и селектор - swipe-config.js,
// визуальные hint-иконки - swipe-hints.js.
// Домен (что означает свайп влево/вправо для сообщения) остаётся в
// features/message-swipe.js, который передаёт сюда только колбэки.
import { swipeConfig } from './swipe-config.js';
import { createSwipeHints, updateSwipeHints, removeSwipeHints } from './swipe-hints.js';

const { TRIGGER, CAP, AXIS_LOCK, INTERACTIVE_SEL } = swipeConfig;

// wire(container, rowSelector, opts) - вешает жест на container (делегирование
// через closest(rowSelector) от e.target, как и раньше для '.msg-row').
// opts:
//   getItem(row) -> любой объект-владелец строки или null (жест игнорируется, если null)
//   leftHintGlyph(row, item)  -> символ иконки при свайпе влево (по умолчанию '↩')
//   rightHintGlyph(row, item) -> символ иконки при свайпе вправо (по умолчанию '⧉')
//   onSwipeLeft(item, bubble)  -> вызывается при срабатывании свайпа СПРАВА НАЛЕВО
//   onSwipeRight(item, bubble) -> вызывается при срабатывании свайпа СЛЕВА НАПРАВО
//   bubbleSelector -> селектор пузыря внутри строки (по умолчанию '.bubble')
export function wireSwipeGesture(container, rowSelector, opts){
  if(!container) return;
  const bubbleSelector = opts.bubbleSelector || '.bubble';
  let g = null; // активный жест: {row, bubble, item, pointerId, x0, y0, axis, dx, hints}

  function cleanup(){
    if(!g) return;
    if(g.bubble){
      g.bubble.style.transition = 'transform .2s ease';
      g.bubble.style.transform = '';
    }
    if(g.row && typeof g.pointerId === 'number'){
      try{ g.row.releasePointerCapture(g.pointerId); }catch(e){ /* уже отпущен браузером */ }
    }
    removeSwipeHints(g.hints);
    g = null;
  }

  function onPointerDown(e){
    if(g) return; // жест уже идёт другим указателем - второй игнорируем
    if(e.button != null && e.button !== 0) return; // правая кнопка мыши/доп.кнопки - не жест
    if(e.target.closest && e.target.closest(INTERACTIVE_SEL)) return; // не перехватываем клики по кнопкам/ссылкам/плееру
    // Ловим нажатие по всей ширине строки (не только по самому пузырю) -
    // так свайп можно начать и с пустого места справа/слева от узкого пузыря.
    const row = e.target.closest && e.target.closest(rowSelector);
    if(!row) return;
    const bubble = row.querySelector(bubbleSelector);
    if(!bubble) return;
    const item = opts.getItem(row);
    if(!item) return;
    g = {
      row, bubble, item, pointerId: e.pointerId,
      x0: e.clientX, y0: e.clientY, axis: null, dx: 0, hints: null,
    };
    // Захватываем указатель на строке (а не на пузыре) - тогда move/up доходят до нас
    // независимо от того, где именно в строке начался жест и куда он потом уедет.
    try{ row.setPointerCapture(e.pointerId); }catch(err){ /* Safari<13 - просто без capture */ }
  }

  function onPointerMove(e){
    if(!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;

    if(g.axis === null){
      if(Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if(g.axis === 'x'){
        const leftGlyph = opts.leftHintGlyph ? opts.leftHintGlyph(g.row, g.item) : '↩';
        const rightGlyph = opts.rightHintGlyph ? opts.rightHintGlyph(g.row, g.item) : '⧉';
        g.hints = createSwipeHints(g.row, g.bubble, leftGlyph, rightGlyph);
      }
    }
    if(g.axis !== 'x') return;

    if(e.cancelable) e.preventDefault();
    let d = dx;
    if(Math.abs(d) > TRIGGER){
      const over = Math.abs(d) - TRIGGER;
      d = Math.sign(d) * (TRIGGER + over * 0.35); // лёгкое "сопротивление" за порогом
    }
    d = Math.max(-CAP, Math.min(CAP, d));
    g.dx = d;
    g.bubble.style.transition = 'none';
    g.bubble.style.transform = 'translateX(' + d + 'px)';

    updateSwipeHints(g.hints, d, TRIGGER);
  }

  function onPointerUp(e){
    if(!g || e.pointerId !== g.pointerId) return;
    const { dx, item, bubble, axis } = g;
    if(axis === 'x' && dx <= -TRIGGER){
      opts.onSwipeLeft && opts.onSwipeLeft(item, bubble);
    } else if(axis === 'x' && dx >= TRIGGER){
      opts.onSwipeRight && opts.onSwipeRight(item, bubble);
    }
    cleanup();
  }

  function onPointerCancel(e){
    if(!g || e.pointerId !== g.pointerId) return;
    cleanup(); // браузер перехватил жест (например, системный скролл/навигация) - просто гасим
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove, {passive:false});
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);
}
