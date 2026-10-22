// ===================== ui/chat-view/unread-tracking.js =====================
// Плашка «Непрочитанные сообщения» и пометка чата прочитанным. Используется render-messages.js, но самостоятельна (IntersectionObserver + запись в историю).
import { $, isUnread } from '../../core/dom-utils.js';
import { messagesOf } from '../../core/state.js';
import { history } from '../../net/history.js';
import { sendDisplayedMarker } from '../../net/messaging/displayed-marker.js';
import { patchRosterRow } from '../roster.js';

let unreadObserver = null;

// Когда плашка полностью уходит выше видимой области, чат считается прочитанным и плашка убирается без полной перерисовки (не дёргаем скролл).
export function watchUnreadDivider(dividerEl, chatJid){
  const messagesEl = $('messages');
  if(!messagesEl || !dividerEl) return;
  const observer = new IntersectionObserver((entries) => {
    for(const entry of entries){
      // isIntersecting=false и rect.top < 0 (относительно списка) - плашка ушла вверх, то есть пролистана. Если она ниже видимой области (rect.top > 0) - ещё не пройдена.
      if(!entry.isIntersecting && entry.boundingClientRect.bottom < (entry.rootBounds ? entry.rootBounds.top : 0)){
        markChatRead(chatJid);
        stopUnreadTracking();
        dividerEl.remove();
      }
    }
  }, {root: messagesEl, threshold: 0});
  observer.observe(dividerEl);
  unreadObserver = observer;
}

export function stopUnreadTracking(){
  if(unreadObserver){
    unreadObserver.disconnect();
    unreadObserver = null;
  }
}

// Помечает входящие прочитанными, сохраняет на диск, обновляет счётчик в сайдбаре (roster.js читает m.read). Шлёт <displayed> (XEP-0333) на последнее входящее с запросом подтверждения - это двойная галочка у собеседника.
export function markChatRead(chatJid){
  const list = messagesOf(chatJid);
  const unread = list.filter(isUnread);
  if(!unread.length) return;
  unread.forEach(m => { m.read = true; });
  history.saveThread(chatJid, list);
  // Перерисовываем одну строку ростера (roster.js:patchRosterRow). Ростер сортируется по имени, поэтому замена на месте безопасна.
  patchRosterRow(chatJid);
  const lastMarkableId = list.findLast(m => m && !m.out && m.markable)?.id;
  if(lastMarkableId) sendDisplayedMarker(chatJid, lastMarkableId);
}
