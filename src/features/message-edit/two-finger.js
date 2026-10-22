// ========= features/message-edit/two-finger.js =========
// Тач: тап двумя пальцами одновременно по пузырю (в т.ч. по тексту) запускает редактирование.
//
// Баг (исправлен): раньше работали только два обычных тапа (click-triggers.js), а на тексте браузер трактует двойной тап как
// выделение слова, и второй click не доходил. Тап двумя пальцами с выделением не конфликтует и приходит как pointerdown/up.
//
// Сессия - от первого пальца на строке сообщения до отпускания всех пальцев. Срабатывает, если peak ровно 2,
// все касания короткие (в сумме DOUBLE_TAP_MS) и никто не сдвинулся дальше TWO_FINGER_MOVE_TOLERANCE (иначе свайп/скролл/pinch).
import { rowOf } from '../message-select/dom.js';

import { startEditForRow, DOUBLE_TAP_MS } from './core.js';

const TWO_FINGER_MOVE_TOLERANCE = 14; // px

export function wireTwoFingerEdit(container){
  let session = null; // {row, t0, touches: Map(pointerId -> {x0,y0}), peak, invalid}

  container.addEventListener('pointerdown', (e) => {
    if(e.pointerType !== 'touch') return;
    const row = rowOf(e);
    if(!row){
      if(session) session.invalid = true; // палец мимо сообщений
      return;
    }
    if(!session || session.touches.size === 0){
      session = { row, t0: Date.now(), touches: new Map(), peak: 0, invalid: false };
    } else if(session.row !== row){
      session.invalid = true; // второй палец в другом сообщении
    }
    session.touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY });
    session.peak = Math.max(session.peak, session.touches.size);
    if(session.peak > 2) session.invalid = true; // третий палец - не двупальцевый тап
  }, {passive:true});

  container.addEventListener('pointermove', (e) => {
    if(!session) return;
    const t = session.touches.get(e.pointerId);
    if(!t) return;
    if(Math.abs(e.clientX - t.x0) > TWO_FINGER_MOVE_TOLERANCE || Math.abs(e.clientY - t.y0) > TWO_FINGER_MOVE_TOLERANCE){
      session.invalid = true; // палец поехал - не тап
    }
  }, {passive:true});

  function onUp(e){
    if(!session || !session.touches.has(e.pointerId)) return;
    session.touches.delete(e.pointerId);
    if(session.touches.size > 0) return; // ждём отпускания всех пальцев
    const s = session;
    session = null;
    if(s.invalid || s.peak !== 2) return;
    if(Date.now() - s.t0 > DOUBLE_TAP_MS) return;
    startEditForRow(s.row);
  }
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
}
