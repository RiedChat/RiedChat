// =================== net/messaging/outgoing/call-signal.js ===================
// Отправка call-сигналов (offer/answer/candidate/decline/hangup/busy) через
// уже существующий XMPP-канал. Сознательно НЕ переиспользует
// encrypt-or-fallback.js: там при неудаче шифрования показывается блокирующая
// модалка "отправить незашифрованным?" и решение запоминается на весь чат в
// S.plaintextFallbackDecision - для SDP/ICE (реальные IP, медиа-capabilities)
// это неприемлемо категорически, и решение "разрешить" для обычных текстовых
// сообщений в этом же чате не должно тихо расшифровывать ещё и звонки.
// Если зашифровать не удалось - сигнал НИКУДА не уходит, без исключений.
import { NS_CALL, NS_HINTS } from '../../../core/constants.js';
import { state } from '../../../core/state.js';
import { uuid } from '../../../core/uuid.js';
import { debugLog } from '../../../core/debug-log.js';
import { omemo } from '../../../crypto/omemo/state.js';

const S = state;

// callId - id звонка (общий на весь его жизненный цикл, генерируется на
// стороне звонящего при call-offer и переиспользуется во всех последующих
// сигналах этого же звонка). payload - произвольный JSON-сериализуемый объект
// (sdp/candidate) или null для decline/hangup/busy.
// to - bare ИЛИ полный (bare/resource) JID адресата. Полный JID нужен, чтобы
// достучаться до КОНКРЕТНОГО ресурса контакта (звонок должен прозвониться
// сразу на все его онлайн-устройства - маршрутизация по bare JID сервер
// отдал бы только одному, "самому доступному"; см.
// features/call/outgoing-call.js:targetJidsFor). OMEMO-шифрование при этом
// всё равно идёт по bare JID (устройства привязаны к аккаунту, не к
// ресурсу) - резолвим его через Strophe.getBareJidFromJid, что для уже
// bare-адреса просто возвращает его же без изменений.
// Возвращает {sent:boolean, reason?} - reason не null только при sent:false:
// 'no-devices' | 'all-devices-dead' | 'send-error'.
export async function sendCallSignal(to, type, callId, payload){
  if(!omemo.enabled || !omemo.ready){
    return { sent:false, reason:'omemo-unavailable' };
  }

  const toBareJid = Strophe.getBareJidFromJid(to);
  let encryptedEl = null;
  try{
    encryptedEl = await omemo.encryptFor(toBareJid, JSON.stringify(payload || {}));
  }catch(e){
    console.warn('sendCallSignal: OMEMO encrypt failed', e);
    return { sent:false, reason:'send-error' };
  }
  if(!encryptedEl){
    const reason = omemo.lastEncryptFailReason === 'all-devices-dead' ? 'all-devices-dead' : 'no-devices';
    return { sent:false, reason };
  }

  const stanzaId = uuid();
  const msg = $msg({to, type:'chat', id: stanzaId})
    .c('call-signal', { xmlns: NS_CALL, type, id: callId }).up();
  msg.cnode(encryptedEl).up();
  // Эфемерный сигнал: попадание в MAM-архив и переигрывание при следующем
  // бэкфилле (net/mam/backfill.js) означало бы "входящий звонок" из позавчера -
  // <store>/<no-store> из urn:xmpp:hints именно для этого и существуют.
  msg.c('no-store', { xmlns: NS_HINTS }).up();

  debugLog('OUTGOING <call-signal type=' + type + ' id=' + callId + '>: ' + msg.toString());
  try{
    S.connection.send(msg);
  }catch(e){
    console.warn('sendCallSignal: connection.send failed', e);
    return { sent:false, reason:'send-error' };
  }
  return { sent:true };
}
