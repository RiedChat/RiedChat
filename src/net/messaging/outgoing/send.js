// ===================== net/messaging/outgoing/send.js =====================
// Возвращает {sent, encrypted, fallbackReason}.
// sent=false означает, что сообщение НИКУДА не ушло: либо шло бы без шифрования
// и пользователь в блокирующей модалке отказался это подтвердить (или уже отказывался
// для этого чата ранее в этой сессии - см. S.plaintextFallbackDecision). Вызывающий код
// (compose.js:sendCurrentMessage) в этом случае обязан не считать сообщение отправленным:
// не чистить поле ввода и не сбрасывать цитату.
// fallbackReason не null, если отправка всё же ушла БЕЗ шифрования (пользователь явно
// согласился) - вызывающий код решает, показывать ли за это toast (см.
// fallback-notify.js:notifyEncryptionFallback).
import { state } from '../../../core/state.js';
import { uuid } from '../../../core/uuid.js';
import { debugLog } from '../../../core/debug-log.js';
import { history } from '../../history.js';
import { patchRosterRow } from '../../../ui/roster.js';
import { appendMessage } from '../../../ui/chat-view/render-messages.js';
import { bumpOutgoingMessageCount } from '../../trusted-contacts.js';
import { encryptOrFallback } from './encrypt-or-fallback.js';
import { appendStanzaBody } from './stanza-body.js';
import { t } from '../../../i18n/t.js';

const S = state;

// localFileName - настоящее имя файла, как оно называлось у отправителя В
// МОМЕНТ ЗАГРУЗКИ (file.name из net/upload.js, взятое ДО шифрования и ДО
// аплоада). Кладём его прямо в локальную запись сообщения, а не полагаемся
// на то, что потом получится вытащить его обратно из ссылки (media.fileNameOf) -
// та работает только с тем, что реально попало в саму ссылку, и годится как
// общий канал для СОБЕСЕДНИКА (другого способа передать ему имя файла у нас
// нет), но для СВОЕЙ же собственной исходящей записи это лишний и хрупкий
// круг: base64/URL-кодирование туда и разбор обратно, притом что имя файла
// у нас и так уже есть на руках как обычная JS-строка.
export async function sendMessage(toJid, body, localFileName){
  // ВАЖНО: раньше здесь стояла проверка `chatSupport[toJid] !== false` ДО вызова
  // encryptFor(), и раньше же encryptFor() форсировал getDeviceList(toBareJid, true)
  // на КАЖДУЮ отправку - это гарантировало актуальность списка устройств ценой
  // сетевого round-trip перед каждым сообщением (см. историю правок discovery.js).
  // Теперь актуальность device-list поддерживается событийно: пуш-уведомления PEP
  // (см. discovery.js:_applyPushedDeviceList, connection.js:+notify caps) обновляют
  // chatSupport/deviceListCache по мере изменений на стороне собеседника, а
  // getDeviceList внутри encryptFor() просто читает свежий кэш без сети. Поэтому
  // пробуем зашифровать всегда, когда OMEMO включён и готов, без ранней отсечки.
  const { blocked, encryptedEl, fallbackReason } = await encryptOrFallback(toJid, body, t('messaging.actionMessage'));
  if(blocked) return { sent:false, encrypted:false, fallbackReason };

  // Один и тот же id используется и в самой станзе, и в локальной записи
  // сообщения - иначе <displayed id='...'>, который потом пришлёт собеседник,
  // не с чем было бы сопоставить (раньше это были два разных uuid()).
  const msgId = uuid();
  const msg = $msg({to: toJid, type:'chat', id: msgId});
  const encrypted = appendStanzaBody(msg, encryptedEl, body);

  // Полный сырой XML исходящей станзы - сверить rid'ы, реально ушедшие на сервер,
  // с тем, что показывает getDeviceList/RAW IQ-result выше по логу.
  debugLog('OUTGOING <message>: ' + msg.toString());
  S.connection.send(msg);
  S.messages[toJid] = S.messages[toJid] || [];
  S.messages[toJid].push({id: msgId, body, time: Date.now(), out:true, encrypted, read:true, status:'sent', fileName: localFileName || null});
  const newIdx = S.messages[toJid].length - 1;
  history.saveThread(toJid, S.messages[toJid]).catch(e => history.reportWriteError(e, t('history.ctxChatHistory')));
  // Эвристика "доверенный контакт" (riedchat-security-plan.md, п.5) считает
  // только исходящие сообщения - см. net/trusted-contacts.js, почему входящие
  // намеренно не учитываются.
  bumpOutgoingMessageCount(toJid);
  // Точечно дописываем строку вместо полного renderMessages() - см.
  // render-messages.js:appendMessage.
  if(S.activeChat === toJid) appendMessage(newIdx);
  patchRosterRow(toJid);
  return { sent:true, encrypted, fallbackReason };
}
