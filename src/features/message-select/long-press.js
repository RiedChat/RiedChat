// ============== features/message-select/long-press.js ==============
// Вход в режим выбора - долгое нажатие (~450мс, без сдвига) на сообщении. Пока режим активен:
// - тап по любому сообщению добавляет/убирает его из выборки вместо обычного действия (медиа, цитата, правка);
// - свайп и редактирование отключены (msgByRow-гварды в message-edit/core.js и message-swipe/shared.js);
// - "×" в панели снимает выбор;
// - корзина после подтверждения удаляет отмеченное локально (у собеседника и на других устройствах остаётся).
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { onRenderMessages } from '../../ui/chat-view/render-messages.js';

import { deleteSelected } from './delete.js';
import { rowOf, isInteractive } from './dom.js';
import { toggleRow, exitSelectMode, syncSelectionUI } from './mode.js';

const LONG_PRESS_MS = 450; // порог удержания, мс
const MOVE_TOLERANCE = 10; // px: сдвиг, после которого это скролл/свайп

export function wireMessageSelect(){
  const el = $('messages');
  const closeBtn = $('select-bar-close');
  const deleteBtn = $('select-bar-delete');
  if(!el || !closeBtn || !deleteBtn) return;

  onRenderMessages(() => { if(state.selecting) syncSelectionUI(); });

  let timer = null;
  let pending = null; // {row, pointerId, x0, y0}
  let justActivated = false; // долгое нажатие только что сработало - гасим следующий click

  function clearTimer(){
    if(timer){ clearTimeout(timer); timer = null; }
    pending = null;
  }

  el.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return; // не левая кнопка мыши
    if(isInteractive(e)) return; // не перехватываем плеер/ссылки/кнопки
    const row = rowOf(e);
    if(!row) return;
    clearTimer();
    pending = { row, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      if(!pending || pending.row !== row) return;
      justActivated = true;
      toggleRow(row);
      if(navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if(!pending || e.pointerId !== pending.pointerId) return;
    if(Math.abs(e.clientX - pending.x0) > MOVE_TOLERANCE || Math.abs(e.clientY - pending.y0) > MOVE_TOLERANCE){
      clearTimer(); // палец/курсор уехал - скролл/свайп
    }
  });
  el.addEventListener('pointerup', clearTimer);
  el.addEventListener('pointercancel', clearTimer);

  // Подавляем системное меню/выделение текста при долгом касании, пока таймер ждёт или режим активен.
  el.addEventListener('contextmenu', (e) => {
    if(pending || state.selecting) e.preventDefault();
  });

  // Перехватываем click раньше остальных обработчиков (click-triggers.js, media-viewer.js, quote-jump.js): в режиме выбора тап только переключает выборку.
  // capture:true + stopPropagation - они все в фазе всплытия.
  el.addEventListener('click', (e) => {
    if(justActivated){
      // Click сразу после долгого нажатия: сообщение уже выбрано таймером.
      justActivated = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if(!state.selecting) return;
    e.stopPropagation();
    e.preventDefault();
    if(isInteractive(e)) return;
    const row = rowOf(e);
    if(row) toggleRow(row);
  }, true);

  closeBtn.addEventListener('click', () => exitSelectMode());
  deleteBtn.addEventListener('click', () => deleteSelected());
}
