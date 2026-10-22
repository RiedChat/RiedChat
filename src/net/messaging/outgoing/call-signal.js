// =================== net/messaging/outgoing/call-signal.js ===================
// Отправка call-сигналов (offer/answer/candidate/decline/hangup/busy) по XMPP.
// НЕ использует encrypt-required.js: сигнал эфемерный, тост "не отправлено" на каждый ICE-кандидат
// не нужен - причину отказа обрабатывает вызывающий (features/call). Не удалось зашифровать - сигнал
// не уходит, без исключений (для SDP/ICE: реальные IP, media-capabilities).
import { NS_CALL, NS_HINTS } from '../../../core/constants.js';
import { debugLog } from '../../../core/debug-log.js';
import { state } from '../../../core/state.js';
import { omemo } from '../../../crypto/omemo/state.js';

// callId - id звонка (генерирует звонящий при call-offer, общий для всех сигналов звонка).
// payload - JSON-сериализуемый объект (sdp/candidate) или null для decline/hangup/busy.
// to - bare или полный JID. Полный нужен для КОНКРЕТНОГО ресурса (звонок идёт на все онлайн-устройства;
// по bare сервер отдал бы одному; features/call/outgoing-call.js:targetJidsFor). OMEMO идёт по bare JID
// (устройства привязаны к аккаунту) - Strophe.getBareJidFromJid.
// Возвращает {sent:boolean, reason?}; reason только при sent:false: 'no-devices' | 'all-devices-dead' | 'send-error'.
export async function sendCallSignal(to, type, callId, payload){
  if(!omemo.ready) return { sent:false, reason:'omemo-unavailable' };
  try{
    const encryptedEl = await omemo.encryptFor(Strophe.getBareJidFromJid(to), JSON.stringify(payload || {}));
    if(!encryptedEl) return { sent:false, reason: omemo.encryptFailReason() };

    // Эфемерный сигнал: <no-store> (urn:xmpp:hints) не даёт серверу хранить его в архиве.
    const msg = $msg({to, type:'chat', id: crypto.randomUUID()})
      .c('call-signal', { xmlns: NS_CALL, type, id: callId }).up()
      .cnode(encryptedEl).up()
      .c('no-store', { xmlns: NS_HINTS }).up();

    debugLog('OUTGOING <call-signal type=' + type + ' id=' + callId + '>: ' + msg.toString());
    state.connection.send(msg);
    return { sent:true };
  }catch(e){
    console.warn('sendCallSignal failed', e);
    return { sent:false, reason:'send-error' };
  }
}
