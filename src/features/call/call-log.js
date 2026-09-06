// ===================== features/call/call-log.js =====================
// Лог звонка в историю чата (S.messages) - по аналогии с обычными
// сообщениями (см. net/messaging/incoming/message-handler.js), только
// текстовая строка вместо тела чужого сообщения, никуда по сети не уходит.
import { state } from '../../core/state.js';
import { uuid } from '../../core/uuid.js';
import { history } from '../../net/history.js';
import { renderMessages } from '../../ui/chat-view/render-messages.js';
import { renderRoster } from '../../ui/roster.js';
import { t } from '../../i18n/t.js';

const S = state;

export function formatDuration(ms){
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

export function callEndSummary(call, reason){
  if(call.connectedAt){
    return '📞 ' + t('call.log.ended') + ' · ' + formatDuration(Date.now() - call.connectedAt);
  }
  if(call.direction === 'in'){
    return reason === 'declined-by-us' ? '📞 ' + t('call.log.declined') : '📞 ' + t('call.log.missed');
  }
  if(reason === 'busy') return '📞 ' + t('call.log.busy');
  return '📞 ' + t('call.log.cancelled');
}

export function logCallEvent(call, text){
  if(!call || !call.bareJid) return;
  const bare = call.bareJid;
  S.roster[bare] = S.roster[bare] || {name: bare.split('@')[0], presence:'offline'};
  S.messages[bare] = S.messages[bare] || [];
  const isActiveChat = S.activeChat === bare;
  S.messages[bare].push({id: uuid(), body: text, time: Date.now(), out: call.direction === 'out', call:true, read: isActiveChat});
  history.saveThread(bare, S.messages[bare]).catch(e => history.reportWriteError(e, t('chatView.chatHistoryLabel')));
  if(isActiveChat) renderMessages();
  renderRoster();
}
