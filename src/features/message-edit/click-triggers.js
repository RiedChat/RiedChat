// ======= features/message-edit/click-triggers.js =======
// Два клика подряд и клик средней кнопкой по сообщению тоже запускают редактирование.
import { rowOf, isInteractive } from '../message-select/dom.js';

import { startEditForRow, DOUBLE_TAP_MS } from './core.js';

// Клик по ссылке/кнопке/цитате внутри сообщения - не жест редактирования.
const isEditBlocked = (e) => isInteractive(e, '.quote-block');

export function wireClickTriggers(el){
  let lastTapRow = null;
  let lastTapTime = 0;

  el.addEventListener('click', (e) => {
    if(isEditBlocked(e)) return;
    const row = rowOf(e);
    if(!row) return;
    const now = Date.now();
    const isSecondTap = row === lastTapRow && (now - lastTapTime) <= DOUBLE_TAP_MS;
    lastTapRow = row;
    // Сброс времени после срабатывания, чтобы третий тап не засчитался со вторым.
    lastTapTime = isSecondTap ? 0 : now;
    if(!isSecondTap) return;

    startEditForRow(row);
  });

  // Средняя кнопка даёт "auxclick", а не "click".
  el.addEventListener('auxclick', (e) => {
    if(e.button !== 1) return;
    if(isEditBlocked(e)) return;
    const row = rowOf(e);
    if(!row) return;
    e.preventDefault(); // без автопрокрутки по средней кнопке
    startEditForRow(row);
  });
}
