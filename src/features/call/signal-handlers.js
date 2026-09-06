// ===================== features/call/signal-handlers.js =====================
// Обработчики входящих сигналов звонка - вызываются из
// net/messaging/incoming/call-signal.js через onSignal().
import { state } from '../../core/state.js';
import { toast } from '../../core/dom-utils.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { renderCallUI } from '../../ui/call-view.js';
import { setCall, teardown } from './call-state.js';
import { logCallEvent, callEndSummary } from './call-log.js';
import { startRingtone, stopRingtone } from './ringtone.js';
import { flushPendingCandidates } from './peer-connection.js';
import { t } from '../../i18n/t.js';

const S = state;

// fromJid - полный JID отправителя (bare/resource), bare - его же bare-часть.
export function onSignal(fromJid, bare, type, callId, payload){
  switch(type){
    case 'offer': return _onOffer(fromJid, bare, callId, payload);
    case 'answer': return _onAnswer(fromJid, bare, callId, payload);
    case 'candidate': return _onCandidate(fromJid, bare, callId, payload);
    case 'decline': return _onRemoteEnd(fromJid, bare, callId, 'declined', payload);
    case 'hangup': return _onRemoteEnd(fromJid, bare, callId, 'hangup', payload);
    case 'busy': return _onRemoteEnd(fromJid, bare, callId, 'busy', payload);
  }
}

function _onOffer(fromJid, bare, callId, payload){
  if(S.call){
    if(S.call.id === callId && S.call.bareJid === bare && payload && payload.renegotiate){
      // Не новый звонок, а ICE-restart уже идущего (см.
      // peer-connection.js:createPeerConnection→onnegotiationneeded) -
      // отвечаем новым answer на тот же pc, а не 'busy'.
      return _onRenegotiateOffer(fromJid, callId, payload);
    }
    // Уже есть активный/звонящий звонок - отвечаем busy этому новому
    // офферу, не трогая текущий S.call. reason сообщает звонящему, ЧЕМ
    // именно мы заняты (сами кому-то звоним / уже разговариваем), чтобы
    // toast на его стороне был точнее (см. _onRemoteEnd ниже).
    sendCallSignal(fromJid, 'busy', callId, { reason: S.call.status });
    return;
  }
  // getUserMedia/pc создаются только в acceptCall() - не запрашивать
  // доступ к камере/микрофону на одном лишь входящем офере, до явного
  // согласия пользователя.
  setCall({
    id: callId, bareJid: bare, remoteJid: fromJid, direction:'in', status:'ringing-in',
    pc:null, localStream:null, remoteStream:null, pendingCandidates:[], muted:false, cameraOff:false,
    // Тип звонка виден заранее - по m=video в SDP оффера, до всякого
    // getUserMedia - чтобы UI мог показать "видеозвонок"/"аудиозвонок"
    // ещё на экране "принять/отклонить".
    hasVideo: !!(payload && payload.sdp && /\r?\nm=video /.test(payload.sdp)),
    offer: payload, connectedAt:null,
  });
  startRingtone();
}

function _onRenegotiateOffer(fromJid, callId, payload){
  const call = S.call;
  if(!call || !call.pc) return;
  call.pc.setRemoteDescription(new RTCSessionDescription(payload))
    .then(() => flushPendingCandidates(call))
    .then(() => call.pc.createAnswer())
    .then(answer => call.pc.setLocalDescription(answer).then(() =>
      sendCallSignal(fromJid, 'answer', callId, { sdp: answer.sdp, type: answer.type })))
    .catch(e => console.warn('_onRenegotiateOffer: negotiation failed', e));
}

function _onAnswer(fromJid, bare, callId, payload){
  const call = S.call;
  if(!call || call.id !== callId || call.direction !== 'out' || !call.pc) return;
  // Уже разрешили, кто из ресурсов ответил первым - поздний/повторный
  // answer от кого-то ещё игнорируем.
  if(call.remoteJid !== call.bareJid && call.remoteJid !== fromJid) return;
  call.remoteJid = fromJid;
  call.status = 'connecting';
  renderCallUI();
  call.pc.setRemoteDescription(new RTCSessionDescription(payload))
    .then(() => flushPendingCandidates(call))
    .catch(e => console.warn('_onAnswer: setRemoteDescription failed', e));

  // "Кто первый принял - остальным отбой": отменяем звонок на всех прочих
  // онлайн-ресурсах того же контакта, которым мы разослали offer.
  if(call.ringingTargets){
    for(const t of call.ringingTargets){
      if(t !== fromJid) sendCallSignal(t, 'hangup', callId, { reason:'answered-elsewhere' });
    }
    call.ringingTargets = null;
  }
}

function _onCandidate(fromJid, bare, callId, payload){
  const call = S.call;
  if(!call || call.id !== callId) return;
  if(call.pc && call.pc.remoteDescription && call.pc.remoteDescription.type){
    call.pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.warn('_onCandidate: addIceCandidate failed', e));
  } else {
    // pc ещё не создан (входящий звонок, ждём accept) или remoteDescription
    // ещё не выставлен (offer/answer только в пути) - копим и применим в
    // flushPendingCandidates() сразу после setRemoteDescription.
    call.pendingCandidates.push(payload);
  }
}

function _onRemoteEnd(fromJid, bare, callId, reason, payload){
  const call = S.call;
  if(!call || call.id !== callId || call.bareJid !== bare) return;
  stopRingtone();
  if(payload && payload.reason === 'answered-elsewhere'){
    // Это не "нам" отбой - просто один из наших исходящих offer'ов на
    // множество ресурсов контакта проиграл гонку другому его устройству,
    // которое ответило первым. Не пропущенный звонок, лог не пишем.
    teardown(call);
    setCall(null);
    return;
  }
  if(reason === 'busy'){
    const busyReason = payload && payload.reason;
    toast(busyReason === 'ringing-out'
      ? t('call.contactCallingSomeoneElse')
      : t('call.contactAlreadyTalking'));
  }
  logCallEvent(call, callEndSummary(call, reason));
  teardown(call);
  setCall(null);
}
