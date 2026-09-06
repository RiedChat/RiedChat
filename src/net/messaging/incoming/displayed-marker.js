// ============= net/messaging/incoming/displayed-marker.js =============
// XEP-0333: применение входящего маркера "прочитано" к нашим исходящим
// сообщениям. Вызывается как из _earlyHandlers (incoming.js), так и как
// именованный экспорт для остального приложения.
import { state } from '../../../core/state.js';
import { history } from '../../history.js';
import { t } from '../../../i18n/t.js';
import { renderMessages } from '../../../ui/chat-view/render-messages.js';

const S = state;

// Отмечает наши исходящие сообщения в чате с fromBare статусом "прочитано"
// вплоть до сообщения с id === markerId включительно (по XEP-0333 факт показа
// одного сообщения означает, что все более ранние тоже увидены).
export function handleDisplayedMarker(fromBare, markerId){
  const list = S.messages[fromBare];
  if(!list || !markerId) return;
  const idx = list.findIndex(m => m && m.out && m.id === markerId);
  if(idx === -1) return; // например, маркер относится к сообщению, ещё не попавшему в локальную историю
  let changed = false;
  for(let i = 0; i <= idx; i++){
    const m = list[i];
    if(m && m.out && m.status !== 'read'){ m.status = 'read'; changed = true; }
  }
  if(!changed) return;
  history.saveThread(fromBare, list).catch(e => history.reportWriteError(e, t('history.ctxChatHistory')));
  if(S.activeChat === fromBare) renderMessages();
}
