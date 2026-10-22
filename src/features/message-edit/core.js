// ============ features/message-edit/core.js ============
// Общая логика режима редактирования: поиск сообщения по DOM-строке, проверка редактируемости, старт и отмена правки.
// Используется two-finger.js, click-triggers.js.
import { $, fireInput } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { splitQuotedBody } from '../../core/text-patterns.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { msgByRow } from '../message-select/dom.js';

// Макс. интервал между двумя тапами/кликами по сообщению; нативный dblclick не используем - на тачскринах его может съесть системный зум.
export const DOUBLE_TAP_MS = 350;

// Редактировать можно только своё текстовое сообщение: у медиа-пузырей в bubble.dataset.kind стоит тип (ui/chat-view/bubble-renderers.js), у текстового его нет.
function isEditable(msg, bubble){
  if(!msg || !msg.out) return false;
  const kind = bubble?.dataset.kind;
  return !kind;
}

export function startEdit(msg, bubble){
  if(!isEditable(msg, bubble)) return;
  state.replyTo = null; // редактирование и цитирование взаимоисключающи
  // Если сообщение было ответом с цитатой (net/messaging/outgoing.js:buildQuotedBody), в поле идёт только текст;
  // quotePrefix запоминаем, чтобы вернуть цитату при отправке правки (sendCurrentMessage).
  const split = splitQuotedBody(msg.body);
  const editableText = split ? split.rest : (msg.body || '');
  state.editing = { id: msg.id, quotePrefix: split ? split.prefix : '' };
  renderReplyBar();
  const input = $('msg-input');
  if(input){
    input.value = editableText;
    // Пересчёт высоты textarea и кнопок отправки/микрофона - тот же "input"-обработчик, что в features/composer.js.
    fireInput(input);
    input.focus();
    const len = input.value.length;
    try{ input.setSelectionRange(len, len); }catch{ /* не критично */ }
  }
  if(navigator.vibrate) navigator.vibrate(12);
}

// Цепочка "строка -> сообщение + .bubble -> startEdit" для всех жестов.
export function startEditForRow(row){
  const msg = msgByRow(row);
  const bubble = row.querySelector('.bubble');
  if(!msg || !bubble) return;
  startEdit(msg, bubble);
}

// Отменяет редактирование и очищает поле; вызывается кликом по плашке (features/message-swipe/wire.js:wireMessageSwipe) и при смене чата.
export function cancelEdit(){
  if(!state.editing) return;
  state.editing = null;
  renderReplyBar();
  const input = $('msg-input');
  if(input){
    input.value = '';
    fireInput(input);
  }
}
