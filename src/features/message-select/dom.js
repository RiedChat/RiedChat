// ============== features/message-select/dom.js ==============
// Операции с DOM: событие -> строка сообщения, проверка интерактивного элемента, строка -> id, счётчик, класс "selected" на строках.
import { $ } from '../../core/dom-utils.js';
import { state, activeMessages } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { swipeConfig } from '../../ui/swipe-gesture.js';

// Строка сообщения (.msg-row), где произошло событие, или null.
export const rowOf = (e) => e.target.closest?.('.msg-row') ?? null;

// Событие от интерактивного элемента (плеер/ссылка/кнопка) - жест не запускаем. extraSel - доп. селекторы через запятую, например ".quote-block".
export const isInteractive = (e, extraSel) =>
  !!e.target.closest?.([swipeConfig.INTERACTIVE_SEL, extraSel].filter(Boolean).join(', '));

const rowMessage = (row) => activeMessages()[Number(row.dataset.idx)] ?? null;

export const msgIdByRow = (row) => rowMessage(row)?.id || null;

// В режиме выбора тап/свайп только выбирает строку (без правки и цитаты) - отдаём null.
export function msgByRow(row){
  return state.selecting ? null : rowMessage(row);
}

export function setBarCount(){
  const count = state.selecting?.size ?? 0;
  const countEl = $('select-bar-count');
  const delBtn = $('select-bar-delete');
  if(countEl) countEl.textContent = t('select.countLabel', { count });
  if(delBtn) delBtn.disabled = count === 0;
}

// Проставляет "selected" по state.selecting: при тапе (точечно) и после renderMessages() (onRenderMessages в message-select/long-press.js).
export function applySelectionClasses(){
  $('messages')?.querySelectorAll('.msg-row').forEach(row => {
    row.classList.toggle('selected', !!state.selecting?.has(msgIdByRow(row)));
  });
}
