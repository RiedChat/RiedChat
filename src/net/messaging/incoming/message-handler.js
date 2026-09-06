// =============== net/messaging/incoming/message-handler.js ===============
// Разбор и применение обычного входящего сообщения (после того как ни
// один из earlyHandlers не сработал).
import { state } from '../../../core/state.js';
import { uuid } from '../../../core/uuid.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { debugLog } from '../../../core/debug-log.js';
import { history } from '../../history.js';
import { parseMessageBody } from '../../message-body-parser.js';
import { sendDisplayedMarker } from '../outgoing.js';
import { renderRoster } from '../../../ui/roster.js';
import { renderMessages } from '../../../ui/chat-view/render-messages.js';
import { bumpContactMessageCount } from '../../trusted-contacts.js';
import { toast, nickOf } from '../../../core/dom-utils.js';
import { t } from '../../../i18n/t.js';

const S = state;

export async function handleIncomingMessage(stanza, bare, type){
  debugLog('<message> от ' + stanza.getAttribute('from') + ' type=' + type + ' encrypted=' + !!stanza.querySelector('encrypted') + ' body=' + !!stanza.querySelector('body'));
  if(bare === S.myBareJid && !stanza.querySelector('encrypted')) return true;

  // Разбор тела (encrypted/body/fileUrl) - общий с net/mam.js:processArchivedMessage,
  // см. net/message-body-parser.js.
  const parsed = await parseMessageBody(stanza);
  // Расшифровка живого (не архивного) сообщения упала конкретно из-за
  // непринятого нового устройства контакта (см. crypto/omemo/decrypt.js:
  // lastDecryptFailReason) - получатель должен узнать об этом сразу, а не
  // только заметить невнятный текст плейсхолдера в чате постфактум.
  // Для MAM/архивных сообщений (net/mam.js) toast не дублируем - там это
  // могло бы всплыть пачкой при догрузке истории после долгого офлайна.
  if(omemo.lastDecryptFailReason === 'pending-device' && omemo.lastDecryptFailBareJid === bare){
    toast(t('messaging.newDeviceUndecrypted', {name: nickOf(bare)}));
  }
  if(!parsed) return true; // адресовано другому нашему устройству - молча игнорируем
  if(parsed.encrypted && bare === S.myBareJid) return true; // наше собственное сообщение, пришедшее себе для синхронизации
  if(!parsed.body) return true;
  const body = parsed.body;
  const wasEncrypted = parsed.encrypted;

  S.roster[bare] = S.roster[bare] || {name: bare.split('@')[0], presence:'offline'};
  S.messages[bare] = S.messages[bare] || [];
  // Берём id самой станзы (нужен, чтобы потом сослаться на него в <displayed>) -
  // генерируем свой только если сообщение почему-то пришло вовсе без id.
  // markable=true запоминаем только если отправитель попросил подтверждение
  // прочтения (XEP-0333) - иначе маркер в ответ не шлём.
  const incomingId = stanza.getAttribute('id') || uuid();
  const wantsMarker = !!stanza.querySelector('markable');
  // read:true только если пользователь прямо сейчас смотрит в этот чат - иначе
  // сообщение попадёт под плашку "Непрочитанные сообщения" при следующем открытии
  // (см. ui/chat-view/render-messages.js:renderMessages).
  const isActiveChat = S.activeChat === bare;
  // XEP-0203: если сообщение доставлено не "живьём", а было придержано сервером,
  // пока получатель был офлайн (mod_offline), сервер при доставке добавляет
  // <delay xmlns='urn:xmpp:delay' stamp='...'/> прямо в саму станзу - это и есть
  // момент, когда отправитель РЕАЛЬНО отправил сообщение. Без этого код
  // подставлял Date.now() (момент, когда получатель зашёл в сеть и получил
  // сообщение), из-за чего, например, сообщение, отправленное в 18:47 первым
  // собеседником, отображалось со временем получения, а не отправки.
  const delayEl = stanza.querySelector('delay');
  const delayStamp = delayEl && delayEl.getAttribute('stamp');
  const msgTime = delayStamp ? new Date(delayStamp).getTime() : Date.now();
  // downgraded=true - сообщение пришло БЕЗ <encrypted>, хотя у собеседника точно есть
  // OMEMO-устройства (omemo.chatSupport[bare]===true, т.е. чат обычно шифруется).
  // Это и есть признак даунгрейд-атаки (сервер/MITM подменил <encrypted> на <body>) -
  // ui/chat-view/render-messages.js рисует по этому флагу явный баннер-предупреждение,
  // а не просто маленькую иконку 🔓 (см. riedchat-security-plan.md, п.2).
  const downgraded = !wasEncrypted && omemo.chatSupport[bare] === true;
  S.messages[bare].push({id: incomingId, body, time: (msgTime || Date.now()), out:false, encrypted: wasEncrypted, downgraded, read: isActiveChat, markable: wantsMarker});
  history.saveThread(bare, S.messages[bare]).catch(e => history.reportWriteError(e, t('history.ctxChatHistory')));
  // Накопление истории переписки - часть эвристики "доверенный контакт" для
  // автозагрузки картинок (riedchat-security-plan.md, п.5, см. trusted-contacts.js).
  bumpContactMessageCount(bare);

  if(isActiveChat){
    renderMessages();
    // Сообщение пришло, пока чат уже открыт - пользователь видит его сразу
    // (read:true выше), но само это событие в S.messages не "меняет" read
    // (оно и так true при пуше), поэтому _markChatRead() тут ничего не
    // заметит и НЕ отправит подтверждение прочтения сама. Шлём его явно -
    // иначе собеседник никогда не увидит вторую галочку "прочитано" у этого
    // сообщения, пока мы не выйдем из чата и не откроем его заново.
    if(wantsMarker) sendDisplayedMarker(bare, incomingId);
  }
  renderRoster();
  return true;
}
