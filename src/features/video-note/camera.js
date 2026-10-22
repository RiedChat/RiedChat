// ===================== features/video-note/camera.js =====================
// Живой поток камеры: констрейнты кружка, остановка треков/таймеров записи, переключение фронтальной/задней камеры посреди записи.
import { swapVideoTrack } from '../../core/camera.js';
import { $, playQuietly } from '../../core/dom-utils.js';

import { S } from './state.js';

export function stopStream(){
  if(S.rafHandle){ cancelAnimationFrame(S.rafHandle); S.rafHandle = null; }
  // Треки canvas-потока браузер мог закрыть сам (например, превью убрано из DOM); двойной stop() безопасен, но иногда бросает.
  if(S.canvasStream){ S.canvasStream.getTracks().forEach(t => { try{ t.stop(); }catch{} }); S.canvasStream = null; }
  if(S.stream){ S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
  clearInterval(S.timerHandle); S.timerHandle = null;
  clearTimeout(S.autoStopHandle); S.autoStopHandle = null;
}

// Констрейнты камеры кружка (квадрат 480x480): для старта записи (recording.js) и switchCamera.
export function cameraConstraints(facingMode){
  return { facingMode, width: {ideal: 480}, height: {ideal: 480}, aspectRatio: 1 };
}

// Собирает S.stream из видеотрека и текущих аудиотреков, отдаёт превью.
function applyVideoTrack(videoTrack){
  S.stream = new MediaStream([videoTrack, ...S.stream.getAudioTracks()]);
  const preview = $('video-note-preview');
  preview.srcObject = S.stream;
  return preview;
}

// Переключает камеру посреди записи без остановки MediaRecorder (см. шапку video-note/recording.js): меняется только видеотрек в S.stream
// (превью и drawFrame); аудиотрек и canvasStream, который пишет MediaRecorder, не трогаются - звук не обрывается.
export async function switchCamera(){
  if(!S.mediaRecorder || S.mediaRecorder.state !== 'recording') return;
  const newFacing = S.currentFacingMode === 'user' ? 'environment' : 'user';
  // exact, а не ideal: иначе браузер вернёт ту же камеру.
  const { track, switched } = await swapVideoTrack(
    S.stream.getVideoTracks()[0],
    cameraConstraints({ exact: newFacing }),
    cameraConstraints(S.currentFacingMode),
    'videoNote.cameraSwitchFailed',
  );
  if(!track) return; // превью останется чёрным
  // Запись могла завершиться, пока ждали камеру ("стоп") - освобождаем полученный трек.
  if(!S.mediaRecorder || S.mediaRecorder.state !== 'recording'){
    try{ track.stop(); }catch{}
    return;
  }
  const preview = applyVideoTrack(track);
  if(!switched) return; // откат на прежнюю камеру
  S.currentFacingMode = newFacing;
  preview.classList.toggle('mirrored', S.currentFacingMode === 'user');
  playQuietly(preview);
  if(navigator.vibrate) navigator.vibrate(8);
}
