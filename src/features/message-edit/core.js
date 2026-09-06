// ============ features/message-edit/core.js ============
// Общая логика режима редактирования: поиск сообщения по DOM-строке,
// проверка редактируемости, запуск и отмена правки. Используется всеми
// обработчиками жестов (two-finger.js, mouse-buttons.js, click-triggers.js).
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { splitQuotedBody } from '../../core/text-patterns.js';

export const S = state;

// Максимальный интервал между двумя тапами/кликами по одному и тому же
// сообщению, чтобы засчитать их как "два тапа, значит редактируем" - не
// полагаемся на нативный dblclick: на тачскринах он не всегда доходит до
// страницы (может быть съеден системным жестом зума).
export const DOUBLE_TAP_MS = 350;

export function msgByRow(row){
  // Пока активен режим множественного выбора сообщений (см.
  // features/message-select.js), тап/жест по строке должен только выбирать
  // её, а не запускать редактирование - отдаём null, все три триггера
  // редактирования (two-finger.js, mouse-buttons.js, click-triggers.js)
  // считают это "сообщение не найдено" и ничего не делают.
  if(S.selecting) return null;
  const list = S.messages[S.activeChat] || [];
  const idx = Number(row.dataset.idx);
  return Number.isInteger(idx) ? (list[idx] || null) : null;
}

// Редактировать можно только своё текстовое сообщение. У пузырей-медиа
// (фото/видео/голосовое/файл) в bubble.dataset.kind стоит их тип (см.
// ui/chat-view/bubble-renderers.js) - у обычного текстового пузыря этот
// атрибут не проставляется вовсе.
function isEditable(msg, bubble){
  if(!msg || !msg.out) return false;
  const kind = bubble && bubble.dataset.kind;
  return !kind;
}

export function startEdit(msg, bubble){
  if(!isEditable(msg, bubble)) return;
  S.replyTo = null; // редактирование и цитирование взаимоисключающи
  // Если сообщение было ответом с цитатой (см. net/messaging/outgoing.js:
  // buildQuotedBody), в поле ввода должен попасть только реальный текст -
  // блок цитаты не редактируется и не должен маячить как обычный текст.
  // quotePrefix запоминаем, чтобы вернуть цитату на место при отправке правки
  // (см. sendCurrentMessage в net/messaging/outgoing.js).
  const split = splitQuotedBody(msg.body || '');
  const editableText = split ? split.rest : (msg.body || '');
  S.editing = { id: msg.id, quotePrefix: split ? split.prefix : '' };
  renderReplyBar();
  const input = $('msg-input');
  if(input){
    input.value = editableText;
    // Пересчитывает высоту textarea и видимость кнопок отправки/микрофона -
    // тот же обработчик 'input', что и при обычном наборе текста
    // (features/composer.js), без дублирования этой логики здесь.
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.focus();
    const len = input.value.length;
    try{ input.setSelectionRange(len, len); }catch(e){ /* не критично, если браузер не поддержал */ }
  }
  if(navigator.vibrate) navigator.vibrate(12);
}

// Отменяет режим редактирования и очищает поле ввода - вызывается по клику
// на плашку (см. features/message-swipe.js:wireMessageSwipe, тот же
// обработчик, что закрывает и цитату) и при переключении на другой чат.
export function cancelEdit(){
  if(!S.editing) return;
  S.editing = null;
  renderReplyBar();
  const input = $('msg-input');
  if(input){
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }
}
