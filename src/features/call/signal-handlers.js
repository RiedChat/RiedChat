// ===================== features/call/signal-handlers.js =====================
// Обработчики входящих сигналов звонка; вызываются из net/messaging/incoming/call-signal.js через onSignal().
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { renderCallUI } from '../../ui/call-view.js';

import { setCall, endCall, createCall } from './call-state.js';
import { answerOffer, flushPendingCandidates } from './peer-connection.js';
import { startRingtone } from './ringtone.js';

// fromJid - полный JID отправителя, bare - его bare-часть.
const END_REASONS = { decline: 'declined', hangup: 'hangup', busy: 'busy' };

export function onSignal(fromJid, bare, type, callId, payload){
  if(type === 'offer') return _onOffer(fromJid, bare, callId, payload);
  if(type === 'answer') return _onAnswer(fromJid, bare, callId, payload);
  if(type === 'candidate') return _onCandidate(fromJid, bare, callId, payload);
  if(END_REASONS[type]) return _onRemoteEnd(fromJid, bare, callId, END_REASONS[type], payload);
}

function _onOffer(fromJid, bare, callId, payload){
  if(state.call){
    if(state.call.id === callId && state.call.bareJid === bare && payload && payload.renegotiate){
      // Не новый звонок, а ICE-restart идущего (peer-connection.js:createPeerConnection -> onnegotiationneeded): отвечаем новым answer на тот же pc, не "busy".
      return _onRenegotiateOffer(fromJid, callId, payload);
    }
    // Уже есть активный/звонящий звонок - отвечаем busy, state.call не трогаем. reason говорит, чем заняты (звоним/разговариваем) для точного toast (_onRemoteEnd).
    sendCallSignal(fromJid, 'busy', callId, { reason: state.call.status });
    return;
  }
  // getUserMedia/pc создаются только в acceptCall(): доступ к камере/микрофону не запрашиваем до согласия пользователя.
  setCall(createCall({
    id: callId, bareJid: bare, remoteJid: fromJid, direction:'in', status:'ringing-in',
    // Тип звонка - по m=video в SDP оффера до getUserMedia, чтобы UI показал "видеозвонок"/"аудиозвонок" на экране "принять/отклонить".
    hasVideo: !!(payload && payload.sdp && /\r?\nm=video /.test(payload.sdp)),
    offer: payload,
  }));
  startRingtone();
}

function _onRenegotiateOffer(fromJid, callId, payload){
  const call = state.call;
  if(!call || !call.pc) return;
  answerOffer(call, payload)
    .then(answer => sendCallSignal(fromJid, 'answer', callId, answer))
    .catch(e => console.warn('_onRenegotiateOffer: negotiation failed', e));
}

function _onAnswer(fromJid, _bare, callId, payload){
  const call = state.call;
  if(!call || call.id !== callId || call.direction !== 'out' || !call.pc) return;
  // Первый ответивший ресурс уже определён - поздний/повторный answer игнорируем.
  if(call.remoteJid !== call.bareJid && call.remoteJid !== fromJid) return;
  call.remoteJid = fromJid;
  call.status = 'connecting';
  renderCallUI();
  call.pc.setRemoteDescription(new RTCSessionDescription(payload))
    .then(() => flushPendingCandidates(call))
    .catch(e => console.warn('_onAnswer: setRemoteDescription failed', e));

  // Кто первый принял - остальным отбой: отменяем звонок на прочих онлайн-ресурсах контакта, куда слали offer.
  if(call.ringingTargets){
    for(const target of call.ringingTargets){
      if(target !== fromJid) sendCallSignal(target, 'hangup', callId, { reason:'answered-elsewhere' });
    }
    call.ringingTargets = null;
  }
}

function _onCandidate(_fromJid, bare, callId, payload){
  const call = state.call;
  if(!call || call.id !== callId || call.bareJid !== bare) return;
  if(call.pc && call.pc.remoteDescription && call.pc.remoteDescription.type){
    call.pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.warn('_onCandidate: addIceCandidate failed', e));
  } else {
    // pc ещё не создан (входящий до accept) или remoteDescription не выставлен - копим и применяем в flushPendingCandidates() после setRemoteDescription.
    call.pendingCandidates.push(payload);
  }
}

function _onRemoteEnd(_fromJid, bare, callId, reason, payload){
  const call = state.call;
  if(!call || call.id !== callId || call.bareJid !== bare) return;
  if(payload && payload.reason === 'answered-elsewhere'){
    // Не "нам" отбой: один из наших offer на ресурсы контакта проиграл гонку другому его устройству. Не пропущенный звонок, лог не пишем.
    endCall(call);
    return;
  }
  if(reason === 'busy'){
    const busyReason = payload && payload.reason;
    toast(busyReason === 'ringing-out'
      ? t('call.contactCallingSomeoneElse')
      : t('call.contactAlreadyTalking'));
  }
  endCall(call, reason);
}
