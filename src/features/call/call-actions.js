// ===================== features/call/call-actions.js =====================
// Действия над текущим звонком (state.call): завершение, отклонение, принятие, мьют/камера.
import { state } from '../../core/state.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { renderCallUI } from '../../ui/call-view.js';

import { endCall, peerJid } from './call-state.js';
import { acquireLocalMedia, switchCallCamera } from './media.js';
import { startPeer, answerOffer } from './peer-connection.js';
import { stopRingtone } from './ringtone.js';

export async function hangup(){
  if(!state.call) return;
  const call = state.call;
  const targets = call.ringingTargets?.size ? [...call.ringingTargets] : [peerJid(call)];
  await Promise.all(targets.map(t => sendCallSignal(t, 'hangup', call.id, null)));
  endCall(call, 'hangup');
}

export async function decline(){
  if(!state.call || state.call.direction !== 'in') return;
  const call = state.call;
  await sendCallSignal(peerJid(call), 'decline', call.id, null);
  endCall(call, 'declined-by-us');
}

export async function acceptCall(){
  const call = state.call;
  if(!call || call.direction !== 'in' || call.status !== 'ringing-in') return { accepted:false, reason:'no-incoming-call' };
  stopRingtone();

  // Камеру запрашиваем только если оффер её содержит (call.hasVideo, signal-handlers.js:_onOffer по m=video в SDP).
  // localStream может быть null (нет устройств/отказ) - звонок всё равно принимаем как приёмная сторона (acquireLocalMedia()).
  const localStream = await acquireLocalMedia(call.hasVideo);
  call.localStream = localStream;
  call.noLocalMedia = !localStream;
  call.status = 'connecting';
  renderCallUI();

  await startPeer(call, localStream);

  try{
    const payload = await answerOffer(call, call.offer);
    const { sent, reason } = await sendCallSignal(peerJid(call), 'answer', call.id, payload);
    if(!sent){
      endCall(call);
      return { accepted:false, reason };
    }
  }catch(e){
    console.warn('acceptCall: negotiation failed', e);
    endCall(call);
    return { accepted:false, reason:'negotiation-error' };
  }
  return { accepted:true };
}

// Отключение звука/камеры через MediaStreamTrack.enabled, без пересогласования: собеседник получает тишину/чёрный кадр, трек тот же.
// prop - флаг в state.call ("muted"/"cameraOff"), tracksOf - выбор треков нужного типа из localStream.
function toggleTracks(prop, tracksOf){
  const call = state.call;
  if(!call || !call.localStream) return;
  call[prop] = !call[prop];
  tracksOf(call.localStream).forEach(tr => { tr.enabled = !call[prop]; });
  renderCallUI();
}

export const toggleMute = () => toggleTracks('muted', s => s.getAudioTracks());
export const toggleCamera = () => toggleTracks('cameraOff', s => s.getVideoTracks());

// Смена фронтальной/задней камеры посреди звонка: подмена трека (и зеркальной canvas-копии для фронталки) - media.js:switchCallCamera(), здесь вызов и перерисовка UI.
export async function switchCamera(){
  if(!state.call || !state.call.hasVideo) return;
  await switchCallCamera(state.call);
  renderCallUI();
}

// Сворачивание не завершает звонок (state.call, треки и RTCPeerConnection не трогаем), только прячет #call-overlay.
// Видео/аудио продолжают играть (display:none не паузит playback). Пока свёрнуто, ui/call-view.js:renderCallBanner показывает плашку "вернуться к звонку".
const setMinimized = (minimized) => {
  if(!state.call) return;
  state.call.minimized = minimized;
  renderCallUI();
};
export const minimizeCall = () => setMinimized(true);
export const restoreCall = () => setMinimized(false);
