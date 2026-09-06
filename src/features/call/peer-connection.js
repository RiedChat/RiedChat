// ===================== features/call/peer-connection.js =====================
// Создание RTCPeerConnection, обработчики ICE/треков/переподключения,
// применение отложенных ICE-кандидатов.
import { state } from '../../core/state.js';
import { toast } from '../../core/dom-utils.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { renderCallUI } from '../../ui/call-view.js';
import { setCall, teardown } from './call-state.js';
import { logCallEvent, callEndSummary } from './call-log.js';
import { t } from '../../i18n/t.js';

const S = state;

// Сколько ждать восстановления соединения после 'disconnected' и попытки
// pc.restartIce(), прежде чем считать звонок окончательно оборванным.
// 'disconnected' у WebRTC не всегда финален (бывает и временный, например
// при переключении Wi-Fi↔LTE) - в отличие от 'failed'/'closed', которые
// трактуем как конец звонка сразу.
export const ICE_RESTART_GRACE_MS = 10000;

// Создаёт RTCPeerConnection и вешает на него все обработчики. call -
// текущий объект S.call (передаётся по ссылке, а не читается заново из S,
// чтобы обработчики гарантированно относились именно к этому звонку даже
// если S.call успеет замениться/обнулиться раньше, чем сработает колбэк).
export function createPeerConnection(call, iceServers){
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (e) => {
    if(!e.candidate) return; // конец сбора кандидатов для текущего generation - трикл-ICE, ничего слать не нужно
    sendCallSignal(call.remoteJid || call.bareJid, 'candidate', call.id, e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    if(S.call !== call) return; // звонок уже завершён/заменён - поздний колбэк, игнорируем
    if(!call.remoteStream) call.remoteStream = new MediaStream();
    call.remoteStream.addTrack(e.track);
    renderCallUI();
  };

  // Реонеготиация (сейчас нужна только для ICE-restart - см.
  // onconnectionstatechange ниже): pc.restartIce() сам помечает следующий
  // createOffer() как ICE-restart и синхронно эмитит negotiationneeded -
  // тут мы просто обязаны на него ответить новым offer/answer через тот же
  // сигналинг, что и при первом соединении, иначе restartIce() ничего не
  // изменит на практике. type='offer' с payload.renegotiate:true отличает
  // это от нового звонка на приёмной стороне (см. onSignal/_onOffer).
  pc.onnegotiationneeded = async () => {
    if(S.call !== call || !call.pc || !call.connectedAt) return; // реонеготиация до первого коннекта нам не нужна - исходный offer уже в пути
    try{
      const offer = await call.pc.createOffer();
      await call.pc.setLocalDescription(offer);
      await sendCallSignal(call.remoteJid || call.bareJid, 'offer', call.id, { sdp: offer.sdp, type: offer.type, renegotiate: true });
    }catch(e){
      console.warn('[call] renegotiation offer failed', e);
    }
  };

  pc.onconnectionstatechange = () => {
    if(S.call !== call) return;
    console.log('[call] connectionState=' + pc.connectionState + ' id=' + call.id);
    if(pc.connectionState === 'connected'){
      if(call._iceRestartTimer){ clearTimeout(call._iceRestartTimer); call._iceRestartTimer = null; }
      if(!call.connectedAt) call.connectedAt = Date.now();
      call.status = 'active';
      renderCallUI();
    } else if(pc.connectionState === 'disconnected'){
      if(!call._iceRestartTimer){
        try{ pc.restartIce(); }catch(e){ console.warn('[call] restartIce failed', e); }
        call._iceRestartTimer = setTimeout(() => {
          call._iceRestartTimer = null;
          if(S.call === call && pc.connectionState !== 'connected'){
            toast(t('call.callInterrupted'));
            logCallEvent(call, callEndSummary(call, 'connection-lost'));
            teardown(call);
            setCall(null);
          }
        }, ICE_RESTART_GRACE_MS);
      }
    } else if(pc.connectionState === 'failed' || pc.connectionState === 'closed'){
      if(call._iceRestartTimer){ clearTimeout(call._iceRestartTimer); call._iceRestartTimer = null; }
      toast(pc.connectionState === 'failed' ? t('call.connectionFailed') : t('call.callInterrupted'));
      logCallEvent(call, callEndSummary(call, 'connection-lost'));
      teardown(call);
      setCall(null);
    }
  };

  return pc;
}

// Кандидаты, пришедшие от собеседника до того, как локальный pc готов
// принимать их (offer ещё не обработан на нашей стороне - типично для
// входящего звонка, пока пользователь не нажал "принять"), копятся здесь
// и применяются сразу после успешного setRemoteDescription.
export async function flushPendingCandidates(call){
  const pending = call.pendingCandidates;
  call.pendingCandidates = [];
  for(const c of pending){
    try{ await call.pc.addIceCandidate(new RTCIceCandidate(c)); }
    catch(e){ console.warn('flushPendingCandidates: addIceCandidate failed', e); }
  }
}
