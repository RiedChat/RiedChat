// =============== net/messaging/incoming/message-handler.js ===============
// Разбор и применение обычного входящего сообщения (если ни один earlyHandler не сработал).
import { debugLog } from '../../../core/debug-log.js';
import { toast, nickOf } from '../../../core/dom-utils.js';
import { state, ensureChat } from '../../../core/state.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { t } from '../../../i18n/t.js';
import { appendMessage } from '../../../ui/chat-view/render-messages.js';
import { patchRosterRow } from '../../../ui/roster.js';
import { history } from '../../history.js';
import { parseIncomingBody } from '../../message-body-parser.js';
import { sendDisplayedMarker } from '../displayed-marker.js';

export async function handleIncomingMessage(stanza, bare, type){
  debugLog('<message> от ' + stanza.getAttribute('from') + ' type=' + type + ' encrypted=' + !!stanza.querySelector('encrypted') + ' body=' + !!stanza.querySelector('body'));
  if(bare === state.myBareJid && !stanza.querySelector('encrypted')) return true;

  const parsed = await parseIncomingBody(stanza, bare);
  // Расшифровка живого сообщения упала из-за непринятого нового устройства контакта
  // (crypto/omemo/decrypt.js:lastDecryptFailReason) - сообщаем сразу тостом.
  if(omemo.lastDecryptFailReason === 'pending-device' && omemo.lastDecryptFailBareJid === bare){
    toast(t('messaging.newDeviceUndecrypted', {name: nickOf(bare)}));
  }
  // null: для другого нашего устройства, пустое тело или наше сообщение себе для синхронизации - игнорируем.
  if(!parsed) return true;
  const { body, encrypted } = parsed;

  ensureChat(bare);
  // id станзы нужен для <displayed>; свой генерируем, только если id нет.
  // markable=true - только если отправитель просил подтверждение прочтения (XEP-0333), иначе маркер не шлём.
  const incomingId = stanza.getAttribute('id') || crypto.randomUUID();
  const wantsMarker = !!stanza.querySelector('markable');
  // read:true только если чат сейчас открыт - иначе сообщение попадёт под плашку "Непрочитанные сообщения"
  // (ui/chat-view/render-messages.js:renderMessages).
  const isActiveChat = state.activeChat === bare;
  // XEP-0203: сообщение, придержанное сервером (mod_offline), приходит с <delay xmlns='urn:xmpp:delay' stamp='...'/> -
  // реальное время отправки. Без него Date.now() показывал бы время получения, а не отправки.
  const stamp = stanza.querySelector('delay')?.getAttribute('stamp');
  const time = (stamp && new Date(stamp).getTime()) || Date.now();
  // downgraded=true: пришло БЕЗ <encrypted>, хотя у собеседника есть OMEMO-устройства
  // (omemo.chatSupport[bare]===true) - признак даунгрейд-атаки (подмена <encrypted> на <body>).
  // ui/chat-view/render-messages.js рисует по флагу баннер-предупреждение (riedchat-security-plan.md, п.2).
  const downgraded = !encrypted && omemo.chatSupport[bare] === true;
  state.messages[bare].push({id: incomingId, body, time, out:false, encrypted, downgraded, read: isActiveChat, markable: wantsMarker});
  const newIdx = state.messages[bare].length - 1;
  history.saveThread(bare, state.messages[bare]);
  // Входящие НЕ учитываются в эвристике "доверенный контакт" (riedchat-security-plan.md, п.5):
  // иначе спамер набирает доверие, присылая TRUST_MESSAGE_THRESHOLD сообщений. Счётчик растёт
  // только от исходящих (outgoing/send.js, net/trusted-contacts.js).

  if(isActiveChat){
    // Дописываем одну строку, без полной перерисовки (render-messages.js:appendMessage,
    // riedchat-perf-notes.md, п.1 - иначе пересоздавались все медиа-пузыри).
    appendMessage(newIdx);
    // Чат открыт, read:true уже стоит - markChatRead() изменений не заметит и подтверждение не отправит.
    // Шлём явно, иначе собеседник не увидит вторую галочку, пока мы не переоткроем чат.
    if(wantsMarker) sendDisplayedMarker(bare, incomingId);
  }
  // Обновляем только строку контакта (превью/непрочитанные): roster.js:patchRosterRow.
  // Для нового контакта без строки в DOM он сам откатывается на полный renderRoster().
  patchRosterRow(bare);
  return true;
}
