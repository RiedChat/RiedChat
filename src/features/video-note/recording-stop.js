// ================ features/video-note/recording-stop.js ================
// Обработчик события "stop" MediaRecorder: собирает записанные чанки в Blob
// и показывает предпросмотр, либо просто закрывает модалку, если запись
// была отменена (S.discardOnStop) или чанков не оказалось.
import { $ } from '../../core/dom-utils.js';
import { S } from './state.js';
import { stopStream } from './camera.js';
import { showModal, showRecordingControls } from './ui.js';

export function onRecorderStop(){
  const usedMimeType = (S.mediaRecorder && S.mediaRecorder.mimeType) || 'video/webm';
  stopStream();
  const preview = $('video-note-preview');
  preview.srcObject = null;
  preview.classList.remove('mirrored');

  if(S.discardOnStop || S.chunks.length === 0){
    S.chunks = [];
    showModal(false);
    return;
  }
  S.recordedBlob = new Blob(S.chunks, {type: usedMimeType});
  S.chunks = [];
  S.recordedUrl = URL.createObjectURL(S.recordedBlob);
  preview.src = S.recordedUrl;
  preview.muted = false;
  preview.controls = true;
  preview.loop = true;
  preview.play().catch(() => {});
  // iOS Safari игнорирует controlsList="nofullscreen" и может открыть
  // системный fullscreen-плеер по тапу на видео - сразу закрываем его,
  // чтобы кружок не разворачивался на весь экран.
  preview.addEventListener('webkitbeginfullscreen', () => {
    if(preview.webkitExitFullscreen) preview.webkitExitFullscreen();
  });
  showRecordingControls(false);
}
