// ===================== features/call/media.js =====================
// Захват локальных треков (камера/микрофон) и смена фронтальной/задней камеры во время звонка.
import { swapVideoTrack } from '../../core/camera.js';
import { hasMediaDevices } from '../../core/recorder.js';

import { createMirroredVideoTrack } from './mirror-track.js';

// Без явного aspectRatio/width/height getUserMedia({video:true}) на части браузеров/драйверов (Chrome + 16:9-сенсоры) откатывается на ~4:3
// и СПЛЮЩИВАЕТ кадр при захвате. Маленькое локальное превью (.call-local-video, 112x150, object-fit:cover) это скрывает,
// а полноэкранный .call-remote-video у собеседника показывает. aspectRatio:16/9 как ideal убирает повод для отката.
function videoConstraints(facingMode){
  return {
    width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 },
    facingMode: { ideal: facingMode || 'user' },
  };
}

// Возвращает MediaStream или null ("своих треков нет": нет устройств, разрешения или контекст небезопасен). Это не повод срывать звонок:
// пользователь может участвовать как приёмная сторона (startCall/acceptCall используют recvonly-трансиверы).
export async function acquireLocalMedia(wantVideo){
  if(!window.isSecureContext || !hasMediaDevices()){
    console.warn('acquireLocalMedia: mediaDevices unavailable (insecure context?) - joining receive-only');
    return null;
  }
  // Видеозвонок с недоступной камерой падает на голосовой; аудиозвонок камеру не запрашивает.
  for(const video of wantVideo ? [videoConstraints('user'), false] : [false]){
    try{
      return await navigator.mediaDevices.getUserMedia({ audio: true, video });
    }catch(e){
      console.warn('acquireLocalMedia: getUserMedia failed (video: ' + !!video + ')', e);
    }
  }
  // Ни камеры, ни микрофона - входим без собственных треков.
  return null;
}

// Без своих треков объявляем приём recvonly-трансивером, иначе в SDP не будет m=audio/m=video.
export function addRecvOnlyTransceivers(pc, wantVideo){
  pc.addTransceiver('audio', { direction: 'recvonly' });
  if(wantVideo) pc.addTransceiver('video', { direction: 'recvonly' });
}

// Добавляет треки localStream в pc. Видеотрек фронтальной камеры (call.facingMode !== "environment") подменяется зеркальной canvas-копией (mirror-track.js),
// чтобы собеседник видел то же, что пользователь в self-view. Аудио и задняя камера - как есть.
// call._mirror = { track, stop }: останавливает rAF-цикл при смене камеры/hangup (switchCallCamera, call-state.js:teardown).
export function addLocalTracksToCall(call, localStream){
  localStream.getTracks().forEach(t =>
    call.pc.addTrack(t.kind === 'video' ? outgoingVideoTrack(call, t, call.facingMode) : t, localStream));
}

// Трек, уходящий собеседнику: сырой для задней камеры, иначе зеркальная копия (call._mirror); предыдущая копия останавливается.
function outgoingVideoTrack(call, rawTrack, facing){
  call._mirror?.stop();
  call._mirror = facing === 'environment' ? null : createMirroredVideoTrack(rawTrack);
  return call._mirror?.track ?? rawTrack;
}

// Меняет камеру посреди звонка без нового offer/answer: RTCRtpSender.replaceTrack() подменяет видеотрек (сырой - задняя, зеркальная копия - фронтальная, mirror-track.js),
// предыдущий call._mirror останавливается. call.facingMode - по умолчанию "user" (outgoing-call.js, call-actions.js).
// Возвращает true при успехе; UI перерисовывает вызывающий код (renderCallUI()).
async function sendVideoTrack(call, rawTrack, facing){
  const trackToSend = outgoingVideoTrack(call, rawTrack, facing);
  const sender = call.pc && call.pc.getSenders().find(s => s.track && s.track.kind === 'video');
  if(sender) await sender.replaceTrack(trackToSend);
}

export async function switchCallCamera(call){
  if(!call || !call.localStream || !call.localStream.getVideoTracks().length) return false;
  const newFacing = call.facingMode === 'environment' ? 'user' : 'environment';
  const oldVideoTrack = call.localStream.getVideoTracks()[0];
  const { track, switched } = await swapVideoTrack(
    oldVideoTrack,
    { ...videoConstraints(newFacing), facingMode: { exact: newFacing } },
    videoConstraints(call.facingMode),
    'call.cameraSwitchFailed',
  );
  // Старая камера уже остановлена: при откате ставим исходную, чтобы видеозвонок не остался без картинки.
  if(!track) return false;
  call.localStream.removeTrack(oldVideoTrack);
  call.localStream.addTrack(track);
  const facing = switched ? newFacing : call.facingMode;
  await sendVideoTrack(call, track, facing);
  call.facingMode = facing;
  return switched;
}
