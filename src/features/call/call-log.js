// ===================== features/call/call-log.js =====================
// Лог звонка в истории чата (state.messages): как обычные сообщения (net/messaging/incoming/message-handler.js), но текстовая строка, по сети не уходит.
import { formatMmSs } from '../../core/dom-utils.js';
import { state, ensureChat } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { history } from '../../net/history.js';
import { renderMessages } from '../../ui/chat-view/render-messages.js';
import { renderRoster } from '../../ui/roster.js';

export function callEndSummary(call, reason){
  if(call.connectedAt){
    return '📞 ' + t('call.log.ended') + ' · ' + formatMmSs(Math.round((Date.now() - call.connectedAt) / 1000));
  }
  let key = 'call.log.cancelled';
  if(call.direction === 'in') key = reason === 'declined-by-us' ? 'call.log.declined' : 'call.log.missed';
  else if(reason === 'busy') key = 'call.log.busy';
  return '📞 ' + t(key);
}

export function logCallEvent(call, text){
  if(!call || !call.bareJid) return;
  const bare = call.bareJid;
  ensureChat(bare);
  const isActiveChat = state.activeChat === bare;
  state.messages[bare].push({id: crypto.randomUUID(), body: text, time: Date.now(), out: call.direction === 'out', call:true, read: isActiveChat});
  history.saveThread(bare, state.messages[bare]);
  if(isActiveChat) renderMessages();
  renderRoster();
}
