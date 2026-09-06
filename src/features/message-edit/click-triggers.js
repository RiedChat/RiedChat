// ======= features/message-edit/click-triggers.js =======
// Два обычных клика подряд (двойной тап без второго пальца) и клик
// колёсиком мыши (средняя кнопка) по сообщению - тоже запускают
// редактирование.
import { msgByRow, startEdit, DOUBLE_TAP_MS } from './core.js';
import { swipeConfig } from '../../ui/swipe-config.js';

export function wireClickTriggers(el){
  let lastTapRow = null;
  let lastTapTime = 0;

  el.addEventListener('click', (e) => {
    if(e.target.closest && e.target.closest(swipeConfig.INTERACTIVE_SEL + ', .quote-block')) return;
    const row = e.target.closest('.msg-row');
    if(!row) return;
    const now = Date.now();
    const isSecondTap = row === lastTapRow && (now - lastTapTime) <= DOUBLE_TAP_MS;
    lastTapRow = row;
    // Сброс времени после срабатывания - иначе третий тап подряд сразу же
    // засчитался бы вместе со вторым ещё раз (в пределах того же окна).
    lastTapTime = isSecondTap ? 0 : now;
    if(!isSecondTap) return;

    const msg = msgByRow(row);
    const bubble = row.querySelector('.bubble');
    if(!msg || !bubble) return;
    startEdit(msg, bubble);
  });

  // Клик колёсиком мыши (средняя кнопка) - событие 'auxclick', а не 'click':
  // браузеры не генерируют обычный click для средней кнопки мыши.
  el.addEventListener('auxclick', (e) => {
    if(e.button !== 1) return;
    if(e.target.closest && e.target.closest(swipeConfig.INTERACTIVE_SEL + ', .quote-block')) return;
    const row = e.target.closest('.msg-row');
    if(!row) return;
    e.preventDefault(); // не даём браузеру открыть автопрокрутку по средней кнопке
    const msg = msgByRow(row);
    const bubble = row.querySelector('.bubble');
    if(!msg || !bubble) return;
    startEdit(msg, bubble);
  });
}
