// ===================== ui/chat-view/unread-tracking.js =====================
// Отслеживание плашки "Непрочитанные сообщения" и пометка чата прочитанным.
// Выделено из ui/chat-view.js: используется render-messages.js через
// this._watchUnreadDivider/_stopUnreadTracking, но логически самостоятельно
// (IntersectionObserver + запись в историю), поэтому живёт отдельным файлом.
import { state } from '../../core/state.js';
import { $ } from '../../core/dom-utils.js';
import { history } from '../../net/history.js';
import { sendDisplayedMarker } from '../../net/messaging/outgoing.js';
import { renderRoster } from '../roster.js';
import { t } from '../../i18n/t.js';

const S = state;

let unreadObserver = null;

// Следит за плашкой "Непрочитанные сообщения": как только пользователь
// долистывает вниз мимо неё (плашка полностью уходит выше видимой области
// списка), считаем сообщения этого чата прочитанными и убираем плашку -
// без полной перерисовки renderMessages(), чтобы не дёргать скролл.
export function _watchUnreadDivider(dividerEl, chatJid){
  const messagesEl = $('messages');
  if(!messagesEl || !dividerEl) return;
  const observer = new IntersectionObserver((entries) => {
    for(const entry of entries){
      // isIntersecting=false и boundingClientRect выше корня (top < 0 относительно
      // viewport списка) означает, что плашка ушла ВВЕРХ за пределы видимой
      // области - то есть пользователь пролистал вниз мимо неё. Если плашка ещё
      // просто не долистана (лежит НИЖЕ видимой области), rect.top будет положительным
      // относительно root - это не считается "пройдено".
      if(!entry.isIntersecting && entry.boundingClientRect.bottom < (entry.rootBounds ? entry.rootBounds.top : 0)){
        _markChatRead(chatJid);
        _stopUnreadTracking();
        dividerEl.remove();
      }
    }
  }, {root: messagesEl, threshold: 0});
  observer.observe(dividerEl);
  unreadObserver = observer;
}

export function _stopUnreadTracking(){
  if(unreadObserver){
    unreadObserver.disconnect();
    unreadObserver = null;
  }
}

// Помечает все входящие сообщения чата прочитанными и сохраняет на диск +
// обновляет счётчик непрочитанных в сайдбаре (roster.js читает m.read).
// Также шлёт собеседнику <displayed> (XEP-0333) на последнее входящее
// сообщение, которое просило подтверждения - это и есть двойная галочка
// "прочитано" у НЕГО в интерфейсе для его исходящих к нам сообщений.
export function _markChatRead(chatJid){
  const list = S.messages[chatJid];
  if(!list || !list.length) return;
  let changed = false;
  let lastMarkableId = null;
  list.forEach(m => {
    if(m && !m.out){
      if(m.read === false){ m.read = true; changed = true; }
      if(m.markable) lastMarkableId = m.id;
    }
  });
  if(changed){
    history.saveThread(chatJid, list).catch(e => history.reportWriteError(e, t('chatView.chatHistoryLabel')));
    renderRoster();
  }
  if(changed && lastMarkableId) sendDisplayedMarker(chatJid, lastMarkableId);
}
