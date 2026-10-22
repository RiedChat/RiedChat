// ===================== net/messaging/outgoing/edit.js =====================
// Исправление отправленного сообщения (XEP-0308): получатель (и наши другие онлайн-устройства) заменяют
// на месте текст сообщения с id === targetId. Станза как в send.js:sendMessage (OMEMO, плейсхолдер-<body>
// для клиентов без OMEMO), но с новым id и <replace id={targetId}/>.
// Возвращает {sent}: false - зашифровать правку не удалось; локально ничего не менялось.
import { NS_LAST_MESSAGE_CORRECTION } from '../../../core/constants.js';
import { debugLog } from '../../../core/debug-log.js';
import { toast } from '../../../core/dom-utils.js';
import { state } from '../../../core/state.js';
import { t } from '../../../i18n/t.js';
import { patchMessageBody } from '../../../ui/chat-view/render-messages.js';
import { history } from '../../history.js';

import { encryptRequired } from './encrypt-required.js';
import { appendStanzaBody } from './stanza-body.js';

export async function editMessage(toJid, targetId, newBody){
  const list = state.messages[toJid] || [];
  // Ищем только среди своих исходящих: чужое редактировать нельзя. UI (features/message-edit.js) такое
  // не пускает, но проверяем и здесь.
  const originalIdx = list.findIndex(m => m?.out && m.id === targetId);
  if(originalIdx === -1){
    toast(t('messaging.editNotFound'));
    return { sent:false };
  }
  const original = list[originalIdx];

  const { encryptedEl } = await encryptRequired(toJid, newBody);
  if(!encryptedEl) return { sent:false };

  const stanzaId = crypto.randomUUID();
  const msg = $msg({to: toJid, type:'chat', id: stanzaId});
  msg.c('replace', {xmlns: NS_LAST_MESSAGE_CORRECTION, id: targetId}).up();
  appendStanzaBody(msg, encryptedEl);

  debugLog('OUTGOING <message> (correction of ' + targetId + '): ' + msg.toString());
  state.connection.send(msg);

  original.body = newBody;
  original.encrypted = true;
  original.edited = true;
  history.saveThread(toJid, list);
  if(state.activeChat === toJid) patchMessageBody(originalIdx);
  return { sent:true };
}
