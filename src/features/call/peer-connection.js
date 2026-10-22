// ===================== features/call/peer-connection.js =====================
// RTCPeerConnection, обработчики ICE/треков/переподключения, применение отложенных ICE-кандидатов.
import { detectMultipleCameras } from '../../core/camera.js';
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { getIceServers } from '../../net/turn/extdisco.js';
import { renderCallUI } from '../../ui/call-view.js';

import { endCall, peerJid, clearIceRestartTimer } from './call-state.js';
import { addLocalTracksToCall, addRecvOnlyTransceivers } from './media.js';

// Сколько ждать восстановления после "disconnected" и pc.restartIce(), прежде чем считать звонок оборванным.
// "disconnected" не всегда финален (например, Wi-Fi<->LTE), в отличие от "failed"/"closed" - они конец сразу.
const ICE_RESTART_GRACE_MS = 10000;

// Создаёт RTCPeerConnection с обработчиками. call - текущий state.call, передаётся по ссылке: колбэки относятся именно к этому звонку, даже если state.call уже заменён/обнулён.
function createPeerConnection(call, iceServers){
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (e) => {
    if(!e.candidate) return; // конец сбора кандидатов (trickle-ICE), слать нечего
    sendCallSignal(peerJid(call), 'candidate', call.id, e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    if(state.call !== call) return; // звонок завершён/заменён - поздний колбэк
    if(!call.remoteStream) call.remoteStream = new MediaStream();
    call.remoteStream.addTrack(e.track);
    renderCallUI();
  };

  // Реонеготиация (нужна для ICE-restart, onconnectionstatechange ниже): pc.restartIce() помечает createOffer() как ICE-restart и эмитит negotiationneeded -
  // отвечаем новым offer/answer через тот же сигналинг. type="offer" с payload.renegotiate:true отличает это от нового звонка (onSignal/_onOffer).
  pc.onnegotiationneeded = async () => {
    if(state.call !== call || !call.pc || !call.connectedAt) return; // до первого коннекта не нужна - исходный offer уже в пути
    try{
      const offer = await call.pc.createOffer();
      await call.pc.setLocalDescription(offer);
      await sendCallSignal(peerJid(call), 'offer', call.id, { sdp: offer.sdp, type: offer.type, renegotiate: true });
    }catch(e){
      console.warn('[call] renegotiation offer failed', e);
    }
  };

  pc.onconnectionstatechange = () => {
    if(state.call !== call) return;
    console.log('[call] connectionState=' + pc.connectionState + ' id=' + call.id);
    if(pc.connectionState === 'connected'){
      clearIceRestartTimer(call);
      if(!call.connectedAt) call.connectedAt = Date.now();
      call.status = 'active';
      renderCallUI();
    } else if(pc.connectionState === 'disconnected'){
      if(!call._iceRestartTimer){
        try{ pc.restartIce(); }catch(e){ console.warn('[call] restartIce failed', e); }
        call._iceRestartTimer = setTimeout(() => {
          call._iceRestartTimer = null;
          if(state.call === call && pc.connectionState !== 'connected'){
            toast(t('call.callInterrupted'));
            endCall(call, 'connection-lost');
          }
        }, ICE_RESTART_GRACE_MS);
      }
    } else if(pc.connectionState === 'failed' || pc.connectionState === 'closed'){
      clearIceRestartTimer(call);
      toast(pc.connectionState === 'failed' ? t('call.connectionFailed') : t('call.callInterrupted'));
      endCall(call, 'connection-lost');
    }
  };

  return pc;
}

// Кандидаты до готовности pc (offer ещё не обработан, например входящий до "принять") копятся здесь и применяются после setRemoteDescription.
export async function flushPendingCandidates(call){
  const pending = call.pendingCandidates;
  call.pendingCandidates = [];
  for(const c of pending){
    try{ await call.pc.addIceCandidate(new RTCIceCandidate(c)); }
    catch(e){ console.warn('flushPendingCandidates: addIceCandidate failed', e); }
  }
}

// Применяет offer собеседника к call.pc, возвращает {sdp, type} нашего answer: setRemoteDescription -> отложенные кандидаты -> createAnswer -> setLocalDescription.
// Общий для первого accept и ICE-restart.
export async function answerOffer(call, offer){
  await call.pc.setRemoteDescription(new RTCSessionDescription(offer));
  await flushPendingCandidates(call);
  const answer = await call.pc.createAnswer();
  await call.pc.setLocalDescription(answer);
  return { sdp: answer.sdp, type: answer.type };
}

// Общая подготовка звонка: определение нескольких камер, создание RTCPeerConnection, локальные треки или recvonly-трансиверы.
// wantVideo по умолчанию - call.hasVideo; у исходящего без localStream hasVideo всегда false, поэтому startCall передаёт wantVideo явно.
export async function startPeer(call, localStream, wantVideo = call.hasVideo){
  if(call.hasVideo && localStream && localStream.getVideoTracks().length){
    detectMultipleCameras().then(has => {
      if(state.call !== call) return;
      call.multipleCameras = has;
      renderCallUI();
    });
  }
  call.pc = createPeerConnection(call, await getIceServers());
  if(localStream) addLocalTracksToCall(call, localStream);
  else addRecvOnlyTransceivers(call.pc, wantVideo);
}
