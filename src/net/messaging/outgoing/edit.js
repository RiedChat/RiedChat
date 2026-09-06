// ===================== net/messaging/outgoing/edit.js =====================
// Отправляет исправление уже отправленного сообщения (XEP-0308 Last Message
// Correction) - вместо новой записи в истории собеседник (и наши другие
// устройства, если они сейчас в сети) заменяют текст сообщения с id ===
// targetId на месте. Станза устроена так же, как в send.js:sendMessage (то же
// OMEMO-шифрование, тот же плейсхолдер-<body> для незашифрованного канала),
// но с новым собственным id и <replace id={targetId}/>, указывающим на
// исправляемое сообщение. Возвращает {sent}: sent=false означает, что
// пользователь отказался отправлять правку незашифрованной (см. send.js
// для того же сценария при обычной отправке) - тогда локально ничего не менялось.
import { NS_LAST_MESSAGE_CORRECTION } from '../../../core/constants.js';
import { state } from '../../../core/state.js';
import { uuid } from '../../../core/uuid.js';
import { debugLog } from '../../../core/debug-log.js';
import { history } from '../../history.js';
import { renderMessages } from '../../../ui/chat-view/render-messages.js';
import { toast } from '../../../core/dom-utils.js';
import { t } from '../../../i18n/t.js';
import { encryptOrFallback } from './encrypt-or-fallback.js';
import { appendStanzaBody } from './stanza-body.js';
import { notifyEncryptionFallback } from './fallback-notify.js';

const S = state;

export async function editMessage(toJid, targetId, newBody){
  const list = S.messages[toJid] || [];
  // Ищем именно среди своих исходящих - редактировать чужое сообщение
  // нельзя, и UI (features/message-edit.js) до этого места такое не пускает,
  // но проверяем ещё раз здесь, а не полагаемся только на вызывающий код.
  const original = list.find(m => m && m.out && m.id === targetId);
  if(!original){
    toast(t('messaging.editNotFound'));
    return { sent:false };
  }

  const { blocked, encryptedEl, fallbackReason } = await encryptOrFallback(toJid, newBody, t('messaging.actionCorrection'));
  if(blocked) return { sent:false };

  const stanzaId = uuid();
  const msg = $msg({to: toJid, type:'chat', id: stanzaId});
  msg.c('replace', {xmlns: NS_LAST_MESSAGE_CORRECTION, id: targetId}).up();
  const encrypted = appendStanzaBody(msg, encryptedEl, newBody);

  debugLog('OUTGOING <message> (correction of ' + targetId + '): ' + msg.toString());
  S.connection.send(msg);

  original.body = newBody;
  original.encrypted = encrypted;
  original.edited = true;
  history.saveThread(toJid, list).catch(e => history.reportWriteError(e, t('history.ctxChatHistory')));
  if(S.activeChat === toJid) renderMessages();
  notifyEncryptionFallback(fallbackReason);
  return { sent:true };
}
