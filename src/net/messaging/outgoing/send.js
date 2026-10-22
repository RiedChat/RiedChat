// ===================== net/messaging/outgoing/send.js =====================
// Возвращает {sent}.
// sent=false - сообщение НИКУДА не ушло: зашифровать не удалось (encrypt-required.js уже показал тост),
// а открытым текстом клиент не отправляет. Вызывающий (compose.js:sendCurrentMessage) не должен
// считать его отправленным: не чистит поле и цитату.
import { debugLog } from '../../../core/debug-log.js';
import { state } from '../../../core/state.js';
import { appendMessage } from '../../../ui/chat-view/render-messages.js';
import { patchRosterRow } from '../../../ui/roster.js';
import { history } from '../../history.js';
import { bumpOutgoingMessageCount } from '../../trusted-contacts.js';

import { encryptRequired } from './encrypt-required.js';
import { appendStanzaBody } from './stanza-body.js';

// localFileName - имя файла у отправителя в момент загрузки (file.name из net/upload.js, до шифрования и аплоада).
// Кладём его прямо в локальную запись, а не восстанавливаем из ссылки (fileNameOf): ссылка - канал
// для собеседника, а для своей записи это лишний хрупкий круг base64/URL-кодирования.
export async function sendMessage(toJid, body, localFileName){
  // Шифруем всегда, без ранней отсечки `chatSupport[toJid] !== false`.
  // encryptFor() не форсирует getDeviceList(toBareJid, true) на каждую отправку (лишний round-trip):
  // актуальность device-list держат PEP-push'и (discovery.js:_applyPushedDeviceList, connection.js:+notify caps),
  // а getDeviceList читает кэш без сети.
  const { encryptedEl } = await encryptRequired(toJid, body);
  if(!encryptedEl) return { sent:false };

  // Один id и в станзе, и в локальной записи - иначе присланный собеседником <displayed id='...'>
  // не с чем сопоставить.
  const msgId = crypto.randomUUID();
  const msg = $msg({to: toJid, type:'chat', id: msgId});
  appendStanzaBody(msg, encryptedEl);

  // Полный сырой XML станзы: сверить rid'ы, ушедшие на сервер, с getDeviceList/RAW IQ-result в логе.
  debugLog('OUTGOING <message>: ' + msg.toString());
  state.connection.send(msg);
  state.messages[toJid] ??= [];
  state.messages[toJid].push({id: msgId, body, time: Date.now(), out:true, encrypted:true, read:true, status:'sent', fileName: localFileName || null});
  const newIdx = state.messages[toJid].length - 1;
  history.saveThread(toJid, state.messages[toJid]);
  // Эвристика "доверенный контакт" (riedchat-security-plan.md, п.5) считает только исходящие
  // (net/trusted-contacts.js).
  bumpOutgoingMessageCount(toJid);
  // Дописываем строку вместо полного renderMessages() (render-messages.js:appendMessage).
  if(state.activeChat === toJid) appendMessage(newIdx);
  patchRosterRow(toJid);
  return { sent:true };
}
