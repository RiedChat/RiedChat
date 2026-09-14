import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { wireSwipeGesture } from '../../ui/swipe-gesture.js';
import { cancelEdit } from '../message-edit.js';
import { loadSwipeReversed, loadBidiQuote } from '../swipe-settings.js';
import { msgByRow } from './shared.js';
import { startReply } from './quote.js';
import { swipeAction } from './copy-download.js';

const S = state;

export function wireMessageSwipe(){
  const el = $('messages');
  if(!el) return;

  // Направление свайпа настраивается в модалке профиля (см.
  // features/swipe-settings.js) - по умолчанию, как в Telegram: справа
  // налево -> цитировать, слева направо -> копировать/скачивать. Реверс
  // меняет обе стороны местами (глиф-подсказку и колбэк) одновременно.
  // loadSwipeReversed() читается заново на каждый жест/подсказку (а не
  // один раз здесь, при навешивании) - так смена настройки в модалке
  // применяется сразу, без перезагрузки страницы.
  const actionGlyph = (row) => {
    const bubble = row.querySelector('.bubble');
    const kind = bubble && bubble.dataset.kind;
    return (kind && kind !== 'text') ? '⬇' : '⧉';
  };

  // "Двунаправленная цитата" (см. features/swipe-settings.js:loadBidiQuote) -
  // приоритетнее реверса: если включена, обе подсказки и оба колбэка -
  // startReply, копирование/скачивание свайпом недоступно вовсе.
  wireSwipeGesture(el, '.msg-row', {
    getItem: msgByRow,
    leftHintGlyph: (row, msg) => loadBidiQuote() ? '↩' : (loadSwipeReversed() ? actionGlyph(row) : '↩'),
    rightHintGlyph: (row, msg) => loadBidiQuote() ? '↩' : (loadSwipeReversed() ? '↩' : actionGlyph(row)),
    onSwipeLeft: (item, bubble) => loadBidiQuote() ? startReply(item, bubble) : (loadSwipeReversed() ? swipeAction(item, bubble) : startReply(item, bubble)),
    onSwipeRight: (item, bubble) => loadBidiQuote() ? startReply(item, bubble) : (loadSwipeReversed() ? startReply(item, bubble) : swipeAction(item, bubble)),
  });

  const replyBar = $('reply-bar');
  if(replyBar){
    // Плашка - не <button>, а обычный div, фокус ни у чего не переносит,
    // поэтому клавиатура на мобильных при тапе не закрывается - никакой
    // отдельный preventDefault для этого больше не нужен. Плашка общая для
    // цитаты и редактирования (см. ui/chat-head.js:renderReplyBar) - клик
    // закрывает то состояние, которое сейчас активно.
    replyBar.addEventListener('click', () => {
      if(S.editing){
        cancelEdit();
        return;
      }
      S.replyTo = null;
      renderReplyBar();
    });
  }
}
