// ===================== features/call/call-actions.js =====================
// Действия над уже существующим звонком (S.call): завершение, отклонение,
// принятие входящего, мьют/камера.
import { state } from '../../core/state.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { getIceServers } from '../../net/turn/extdisco.js';
import { renderCallUI } from '../../ui/call-view.js';
import { setCall, teardown } from './call-state.js';
import { acquireLocalMedia, addLocalTracksToCall, addRecvOnlyTransceivers, detectCallMultipleCameras, switchCallCamera } from './media.js';
import { createPeerConnection, flushPendingCandidates } from './peer-connection.js';
import { logCallEvent, callEndSummary } from './call-log.js';
import { stopRingtone } from './ringtone.js';

const S = state;

export async function hangup(){
  if(!S.call) return;
  const call = S.call;
  stopRingtone();
  const targets = call.ringingTargets && call.ringingTargets.size
    ? Array.from(call.ringingTargets)
    : [call.remoteJid || call.bareJid];
  await Promise.all(targets.map(t => sendCallSignal(t, 'hangup', call.id, null)));
  logCallEvent(call, callEndSummary(call, 'hangup'));
  teardown(call);
  setCall(null);
}

export async function decline(){
  if(!S.call || S.call.direction !== 'in') return;
  const call = S.call;
  stopRingtone();
  await sendCallSignal(call.remoteJid || call.bareJid, 'decline', call.id, null);
  logCallEvent(call, callEndSummary(call, 'declined-by-us'));
  teardown(call);
  setCall(null);
}

export async function acceptCall(){
  const call = S.call;
  if(!call || call.direction !== 'in' || call.status !== 'ringing-in') return { accepted:false, reason:'no-incoming-call' };
  stopRingtone();

  // Запрашиваем камеру только если сам оффер её содержит (call.hasVideo,
  // выставлен в signal-handlers.js:_onOffer по m=video в SDP) - на
  // голосовой звонок нет смысла спрашивать доступ к камере. localStream
  // может вернуться null (нет устройств/отказано в доступе) - принимаем
  // звонок всё равно, как приёмная сторона (см. acquireLocalMedia()).
  const localStream = await acquireLocalMedia(call.hasVideo);
  call.localStream = localStream;
  call.noLocalMedia = !localStream;
  call.facingMode = 'user';
  call.multipleCameras = false;
  call.status = 'connecting';
  renderCallUI();

  if(call.hasVideo && localStream && localStream.getVideoTracks().length){
    detectCallMultipleCameras().then(has => {
      if(S.call !== call) return;
      call.multipleCameras = has;
      renderCallUI();
    });
  }

  const iceServers = await getIceServers();
  call.pc = createPeerConnection(call, iceServers);
  if(localStream){
    addLocalTracksToCall(call, localStream);
  } else {
    addRecvOnlyTransceivers(call.pc, call.hasVideo);
  }

  try{
    await call.pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    await flushPendingCandidates(call);
    const answer = await call.pc.createAnswer();
    await call.pc.setLocalDescription(answer);
    const { sent, reason } = await sendCallSignal(call.remoteJid || call.bareJid, 'answer', call.id, { sdp: answer.sdp, type: answer.type });
    if(!sent){
      teardown(call);
      setCall(null);
      return { accepted:false, reason };
    }
  }catch(e){
    console.warn('acceptCall: negotiation failed', e);
    teardown(call);
    setCall(null);
    return { accepted:false, reason:'negotiation-error' };
  }
  return { accepted:true };
}

// Реальное отключение звука/камеры - переключает MediaStreamTrack.enabled,
// без пересогласования: приёмная сторона просто получает тишину/чёрный
// кадр, трек остаётся тем же (в отличие от remove/addTrack не требует
// повторного offer/answer).
export function toggleMute(){
  if(!S.call || !S.call.localStream) return;
  S.call.muted = !S.call.muted;
  S.call.localStream.getAudioTracks().forEach(t => t.enabled = !S.call.muted);
  renderCallUI();
}

export function toggleCamera(){
  if(!S.call || !S.call.localStream) return;
  S.call.cameraOff = !S.call.cameraOff;
  S.call.localStream.getVideoTracks().forEach(t => t.enabled = !S.call.cameraOff);
  renderCallUI();
}

// Смена фронтальная/задняя камера посреди видеозвонка - сама подмена трека
// (и пересборка зеркальной canvas-копии для фронталки) в media.js:
// switchCallCamera(), здесь только вызов + перерисовка UI.
export async function switchCamera(){
  if(!S.call || !S.call.hasVideo) return;
  await switchCallCamera(S.call);
  renderCallUI();
}


// Сворачивание звонка - не завершает его (S.call остаётся как есть, треки и
// RTCPeerConnection не трогаем), просто прячем #call-overlay и даём вернуться
// в меню/переписку. Видео/аудио-элементы продолжают играть в свёрнутом
// состоянии - display:none браузером не паузит уже идущий playback. Пока
// свёрнуто, ui/chat-head.js:renderCallBanner показывает плашку "вернуться
// к звонку" в чате с тем же собеседником.
export function minimizeCall(){
  if(!S.call) return;
  S.call.minimized = true;
  renderCallUI();
}

export function restoreCall(){
  if(!S.call) return;
  S.call.minimized = false;
  renderCallUI();
}
