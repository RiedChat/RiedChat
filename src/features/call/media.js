// ===================== features/call/media.js =====================
// Захват локальных медиатреков (камера/микрофон) для звонка + смена
// фронтальная/задняя камера посреди уже идущего звонка.
import { toast } from '../../core/dom-utils.js';
import { detectMultipleCameras } from '../video-note/camera.js';
import { createMirroredVideoTrack } from './mirror-track.js';
import { t } from '../../i18n/t.js';

// Без явного aspectRatio/width/height getUserMedia({video:true}) на части
// браузеров/драйверов (особенно Chrome + вебкамеры/сенсоры с нативным 16:9)
// молча откатывается на легаси-констрейнт по умолчанию (эффективно ~4:3) -
// в результате 16:9-кадр не обрезается, а СПЛЮЩИВАЕТСЯ под другое
// соотношение сторон прямо на этапе захвата, до всякого CSS. Локальный
// маленький превью-квадрат (.call-local-video, 112×150) через
// object-fit:cover обрезает изображение достаточно агрессивно, чтобы
// сплющивание было незаметно на глаз - а полноэкранный вид у собеседника
// (.call-remote-video, почти без обрезки) показывает его в полный рост.
// Явный aspectRatio:16/9 как ideal убирает сам повод для этого отката.
function videoConstraints(facingMode){
  return {
    width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 },
    facingMode: { ideal: facingMode || 'user' },
  };
}

// Возвращает MediaStream либо null. null означает "своих треков нет" -
// нет камеры/микрофона, нет разрешения или небезопасный контекст. Это НЕ
// повод срывать звонок: пользователь без устройств ввода всё ещё может
// присутствовать на звонке как приёмная сторона (слышать/видеть собеседника,
// самому не отправляя ничего) - см. startCall/acceptCall, где для null
// вместо addTrack используются recvonly-трансиверы.
export async function acquireLocalMedia(wantVideo){
  if(!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    console.warn('acquireLocalMedia: mediaDevices unavailable (insecure context?) - joining receive-only');
    return null;
  }
  if(wantVideo){
    try{
      return await navigator.mediaDevices.getUserMedia({ audio:true, video: videoConstraints('user') });
    }catch(e){
      console.warn('acquireLocalMedia: video+audio failed, retrying audio-only', e);
    }
  }
  try{
    // Аудиозвонок - камеру не запрашиваем вовсе. Видеозвонок с недоступной
    // камерой (нет устройства/не выдали разрешение) тоже не проваливаем -
    // падаем на голосовой.
    return await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
  }catch(e){
    // Ни камеры, ни микрофона (нет устройств вовсе / отказано в доступе) -
    // не блокируем звонок, входим без собственных треков.
    console.warn('acquireLocalMedia: audio-only failed too - joining receive-only', e);
    return null;
  }
}

// Когда своих треков нет (localStream === null), всё равно нужно объявить
// приём - иначе в SDP не будет m=audio/m=video и мы не получим треки
// собеседника. recvonly-трансивер создаёт m-line без исходящего трека.
export function addRecvOnlyTransceivers(pc, wantVideo){
  pc.addTransceiver('audio', { direction: 'recvonly' });
  if(wantVideo) pc.addTransceiver('video', { direction: 'recvonly' });
}

// Добавляет треки localStream в pc для отправки собеседнику. Видеотрек
// фронтальной камеры (call.facingMode !== 'environment') подменяется на
// зеркальную canvas-копию (см. mirror-track.js) - так собеседник видит ту
// же картинку, что и сам пользователь в своём self-view, а не её отражение.
// Аудиотрек и задняя камера уходят как есть, без обработки.
// call._mirror хранит { track, stop } зеркального трека - нужен для
// остановки rAF-цикла при смене камеры/hangup (см. switchCallCamera и
// call-state.js:teardown).
export function addLocalTracksToCall(call, localStream){
  localStream.getTracks().forEach(t => {
    if(t.kind === 'video' && call.facingMode !== 'environment'){
      call._mirror = createMirroredVideoTrack(t);
      call.pc.addTrack(call._mirror.track, localStream);
    } else {
      call.pc.addTrack(t, localStream);
    }
  });
}

// Определяет один раз при старте видеозвонка, есть ли смысл показывать
// кнопку смены камеры - только если на устройстве реально больше одной
// камеры (переиспользуем ту же эвристику, что и у кружка в video-note/camera.js).
export async function detectCallMultipleCameras(){
  return detectMultipleCameras();
}

// Меняет фронтальную/заднюю камеру ПОСЕРЕДИ уже идущего звонка - без
// повторного offer/answer: RTCRtpSender.replaceTrack() подменяет исходящий
// видеотрек на лету, собеседнику ничего пересогласовывать не нужно.
// call.facingMode - 'user' (фронтальная) по умолчанию, см. outgoing-call.js/
// call-actions.js. Возвращает true при успехе (вызывающий код сам
// перерисовывает UI через renderCallUI()).
// Подставляет исходящему sender'у либо сырой видеотрек (задняя камера),
// либо его зеркальную canvas-копию (фронтальная, см. mirror-track.js) -
// и останавливает предыдущий call._mirror, если он был.
async function sendVideoTrack(call, rawTrack, facing){
  if(call._mirror){ call._mirror.stop(); call._mirror = null; }
  const sender = call.pc && call.pc.getSenders().find(s => s.track && s.track.kind === 'video');
  let trackToSend = rawTrack;
  if(facing !== 'environment'){
    call._mirror = createMirroredVideoTrack(rawTrack);
    trackToSend = call._mirror.track;
  }
  if(sender) await sender.replaceTrack(trackToSend);
}

export async function switchCallCamera(call){
  if(!call || !call.localStream || !call.localStream.getVideoTracks().length) return false;
  const newFacing = call.facingMode === 'environment' ? 'user' : 'environment';
  const oldVideoTrack = call.localStream.getVideoTracks()[0];
  // На большинстве Android-устройств фронтальная и задняя камера не могут
  // быть открыты одновременно - сначала останавливаем старый трек и только
  // потом запрашиваем новый (см. тот же приём в video-note/camera.js).
  try{ oldVideoTrack.stop(); }catch(e){}

  let newStream;
  try{
    newStream = await navigator.mediaDevices.getUserMedia({ audio:false, video: { ...videoConstraints(newFacing), facingMode: { exact: newFacing } } });
  }catch(e){
    console.warn('switchCallCamera: getUserMedia failed', e);
    toast(t('call.cameraSwitchFailed', { detail: (e && e.name) || String(e) }));
    // Старая камера уже остановлена - пытаемся вернуть исходную, чтобы
    // видеозвонок не остался совсем без исходящей картинки молча.
    try{
      const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio:false, video: videoConstraints(call.facingMode) });
      const fallbackTrack = fallbackStream.getVideoTracks()[0];
      call.localStream.removeTrack(oldVideoTrack);
      call.localStream.addTrack(fallbackTrack);
      await sendVideoTrack(call, fallbackTrack, call.facingMode);
    }catch(e2){ /* совсем без камеры оставить нечего - сторона останется без видео от нас */ }
    return false;
  }

  const newVideoTrack = newStream.getVideoTracks()[0];
  call.localStream.removeTrack(oldVideoTrack);
  call.localStream.addTrack(newVideoTrack);
  await sendVideoTrack(call, newVideoTrack, newFacing);
  call.facingMode = newFacing;
  return true;
}
