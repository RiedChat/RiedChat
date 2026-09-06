// ===================== net/messaging/outgoing/displayed-marker.js =====================
// Отправляет <displayed id='msgId'/> собеседнику - вызывается из
// ui/chat-view/unread-tracking.js:_markChatRead(), когда пользователь реально долистал
// до конца непрочитанного и увидел последнее входящее сообщение, а также
// из net/messaging/incoming.js при получении markable-сообщения в открытом чате.
import { NS_CHAT_MARKERS } from '../../../core/constants.js';
import { state } from '../../../core/state.js';
import { uuid } from '../../../core/uuid.js';

const S = state;

export function sendDisplayedMarker(toJid, msgId){
  if(!msgId || !S.connection) return;
  const marker = $msg({to: toJid, type:'chat', id: uuid()})
    .c('displayed', {xmlns: NS_CHAT_MARKERS, id: msgId});
  S.connection.send(marker);
}
