// ============== features/message-select/long-press.js ==============
// Вход в режим выбора - долгое нажатие (~450мс, без сдвига пальца/курсора)
// на любом сообщении. Дальше, пока режим активен:
//  - обычный тап по любому сообщению (в т.ч. выше по списку - можно листать
//    чат и продолжать отмечать) добавляет/убирает его из выборки, вместо
//    обычного действия (открыть медиа, перейти по цитате, начать правку);
//  - свайп и редактирование отключены (см. msgByRow-гварды в
//    message-edit/core.js и message-swipe/shared.js);
//  - кнопка "×" в панели выхода из режима снимает выбор без удаления;
//  - кнопка корзины удаляет отмеченные сообщения локально (после
//    подтверждения) - они пропадают из чата на этом устройстве, но
//    остаются у собеседника и на других устройствах пользователя.
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { swipeConfig } from '../../ui/swipe-config.js';
import { onRenderMessages } from '../../ui/chat-view/render-messages.js';
import { toggleRow, exitSelectMode, reapplySelectionUI } from './mode.js';
import { deleteSelected } from './delete.js';

const S = state;

const LONG_PRESS_MS = 450; // мс - порог "это уже удержание, а не тап"
const MOVE_TOLERANCE = 10; // px - сдвиг пальца/курсора, после которого удержание отменяется (это скролл/свайп)

export function wireMessageSelect(){
  const el = $('messages');
  const closeBtn = $('select-bar-close');
  const deleteBtn = $('select-bar-delete');
  if(!el || !closeBtn || !deleteBtn) return;

  onRenderMessages(reapplySelectionUI);

  let timer = null;
  let pending = null; // {row, pointerId, x0, y0}
  let justActivated = false; // долгое нажатие только что сработало - гасим следующий click по этой же строке

  function clearTimer(){
    if(timer){ clearTimeout(timer); timer = null; }
    pending = null;
  }

  el.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return; // не левая кнопка мыши
    if(e.target.closest && e.target.closest(swipeConfig.INTERACTIVE_SEL)) return; // не перехватываем плеер/ссылки/кнопки
    const row = e.target.closest('.msg-row');
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
      clearTimer(); // палец/курсор уехал - это скролл или свайп, а не удержание
    }
  });
  el.addEventListener('pointerup', clearTimer);
  el.addEventListener('pointercancel', clearTimer);

  // На тачскрине долгое касание иначе откроет системное меню/выделение текста -
  // подавляем его, пока таймер ждёт срабатывания или пока режим выбора уже активен.
  el.addEventListener('contextmenu', (e) => {
    if(pending || S.selecting) e.preventDefault();
  });

  // Перехватываем клик РАНЬШЕ остальных обработчиков сообщений (двойной тап
  // редактирования, открытие медиа, переход по цитате - см. click-triggers.js,
  // media-viewer.js, quote-jump.js): в режиме выбора любой тап по строке
  // должен только переключать её в выборке. capture:true + stopPropagation
  // не даёт событию дойти до их обработчиков (все они висят в фазе всплытия
  // на этом же #messages или его потомках).
  el.addEventListener('click', (e) => {
    if(justActivated){
      // Клик, сгенерированный сразу после сработавшего долгого нажатия -
      // сообщение уже выбрано таймером выше, второй раз переключать не надо.
      justActivated = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if(!S.selecting) return;
    e.stopPropagation();
    e.preventDefault();
    if(e.target.closest && e.target.closest(swipeConfig.INTERACTIVE_SEL)) return;
    const row = e.target.closest('.msg-row');
    if(row) toggleRow(row);
  }, true);

  closeBtn.addEventListener('click', () => exitSelectMode());
  deleteBtn.addEventListener('click', () => deleteSelected());
}
