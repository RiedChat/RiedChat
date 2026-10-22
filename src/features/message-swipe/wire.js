// ===================== features/message-swipe/wire.js =====================
// Свайп по сообщению (как в Telegram):
// - справа налево: цитировать (плашка "Ответ ..." над полем; текст цитаты идёт в начало сообщения - buildQuotedBody в net/messaging/outgoing.js, рендер в ui/chat-view/render-messages.js);
// - слева направо: копировать текст, для медиа - скачать файл.
// Механика жеста (Pointer Events, transform, hint-иконки) - ui/swipe-gesture.js.
// Соседние модули: shared.js (подписи видов вложений), quote.js (startReply), copy-download.js (swipeAction).
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { wireSwipeGesture } from '../../ui/swipe-gesture.js';
import { cancelEdit } from '../message-edit.js';
import { msgByRow } from '../message-select/dom.js';
import { loadSwipeReversed, loadBidiQuote } from '../swipe-settings.js';

import { swipeAction } from './copy-download.js';
import { startReply } from './quote.js';

export function wireMessageSwipe(){
  const el = $('messages');
  if(!el) return;

  // Направление задаётся в модалке профиля (features/swipe-settings.js); по умолчанию как в Telegram: справа налево - цитата, слева направо - копировать/скачать.
  // Реверс меняет стороны (глиф и колбэк). loadSwipeReversed() читается на каждый жест, поэтому настройка применяется без перезагрузки.
  const actionGlyph = (row) => {
    const bubble = row.querySelector('.bubble');
    const kind = bubble?.dataset.kind;
    return (kind && kind !== 'text') ? '⬇' : '⧉';
  };

  // Двунаправленная цитата (features/swipe-settings.js:loadBidiQuote) приоритетнее реверса: оба свайпа - startReply, копирование/скачивание недоступно.
  const replyOn = (side) => loadBidiQuote() || (side === 'left') !== loadSwipeReversed();
  const glyph = (side) => (row) => replyOn(side) ? '↩' : actionGlyph(row);
  const run = (side) => (item, bubble) => (replyOn(side) ? startReply : swipeAction)(item, bubble);
  wireSwipeGesture(el, '.msg-row', {
    getItem: msgByRow,
    leftHintGlyph: glyph('left'),
    rightHintGlyph: glyph('right'),
    onSwipeLeft: run('left'),
    onSwipeRight: run('right'),
  });

  const replyBar = $('reply-bar');
  if(replyBar){
    // Плашка - div, фокус не переносит, клавиатура на мобильных не закрывается. Общая для цитаты и редактирования (ui/chat-head.js:renderReplyBar): клик закрывает активное состояние.
    replyBar.addEventListener('click', () => {
      if(state.editing){
        cancelEdit();
        return;
      }
      state.replyTo = null;
      renderReplyBar();
    });
  }
}
