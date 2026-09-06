// ============== features/message-select/dom.js ==============
// Низкоуровневые операции с DOM: строка -> id сообщения, счётчик в панели,
// проставление класса 'selected' на уже отрисованных строках.
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

const S = state;

export function msgIdByRow(row){
  const list = S.messages[S.activeChat] || [];
  const idx = Number(row.dataset.idx);
  const m = Number.isInteger(idx) ? list[idx] : null;
  return (m && m.id) || null;
}

export function setBarCount(){
  const count = S.selecting ? S.selecting.size : 0;
  const countEl = $('select-bar-count');
  const delBtn = $('select-bar-delete');
  if(countEl) countEl.textContent = t('select.countLabel', { count });
  if(delBtn) delBtn.disabled = count === 0;
}

// Пробегается по уже отрисованным строкам и проставляет класс 'selected'
// по текущему содержимому S.selecting - используется и при обычном тапе
// (точечно), и целиком после renderMessages() (см. onRenderMessages в
// message-select/long-press.js).
export function applySelectionClasses(){
  const el = $('messages');
  if(!el) return;
  el.querySelectorAll('.msg-row').forEach(row => {
    const id = msgIdByRow(row);
    row.classList.toggle('selected', !!(S.selecting && id && S.selecting.has(id)));
  });
}
