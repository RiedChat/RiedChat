// ================ features/video-note/recording-stop.js ================
// Остановка записи: стоп с предпросмотром, отмена без сохранения и обработчик "stop" MediaRecorder -
// собирает чанки в Blob и показывает предпросмотр, либо закрывает модалку при отмене (S.discardOnStop) или отсутствии чанков.
import fixWebmDuration from 'fix-webm-duration';

import { $, playQuietly } from '../../core/dom-utils.js';
import { encodeThumbFromSource } from '../../net/media/thumb-codec.js';

import { stopStream } from './camera.js';
import { S } from './state.js';
import { showModal, showRecordingControls } from './ui.js';


// Для кружков кадр из готового webm достать ненадёжно (recording.js, ui/chat-view/video-poster/index.js: MediaRecorder не пишет индекс кадров, currentTime игнорируется).
// Но во время записи каждый кадр уже рисуется в S.canvasEl (canvas.js/drawFrame) и хранится до следующей записи,
// поэтому превью снимаем с него ДО stopStream() одним синхронным toDataURL().
const THUMB_MAX_DIM = 240;

export function stopAndShowPreview(){
  if(S.mediaRecorder && S.mediaRecorder.state !== 'inactive'){ S.discardOnStop = false; S.mediaRecorder.stop(); }
}

export function cancelRecording(){
  if(S.mediaRecorder && S.mediaRecorder.state !== 'inactive'){ S.discardOnStop = true; S.mediaRecorder.stop(); }
  else{ stopStream(); showModal(false); }
}

function captureCanvasThumb(){
  try{
    if(!S.canvasEl) return null;
    return encodeThumbFromSource(S.canvasEl, THUMB_MAX_DIM);
  }catch{
    return null;
  }
}

// MediaRecorder пишет webm без длительности (Segment/Info с unknown-size - ограничение API): у кружков не работали перемотка/прогресс-бар и захват кадра.
// fix-webm-duration дописывает Duration в Segment/Info по измеренному времени записи (S.startedAt) - кружок ведёт себя как обычное видео.
export async function onRecorderStop(){
  const usedMimeType = (S.mediaRecorder && S.mediaRecorder.mimeType) || 'video/webm';
  // Превью снимаем ДО stopStream(): последний кадр ещё в канвасе (stopStream() его не трогает, но не зависим от порядка при отмене).
  const thumbB64url = (S.discardOnStop || S.chunks.length === 0) ? null : captureCanvasThumb();
  stopStream();
  const preview = $('video-note-preview');
  preview.srcObject = null;
  preview.classList.remove('mirrored');

  if(S.discardOnStop || S.chunks.length === 0){
    S.chunks = [];
    S.recordedThumbB64url = null;
    showModal(false);
    return;
  }
  S.recordedThumbB64url = thumbB64url;
  const rawBlob = new Blob(S.chunks, {type: usedMimeType});
  S.chunks = [];
  const durationMs = Date.now() - S.startedAt;
  try{
    S.recordedBlob = await fixWebmDuration(rawBlob, durationMs, {logger: false});
  }catch{
    // Патч - правка байтов готового файла, почти не падает; при невалидном EBML лучше кружок без перемотки, чем отказ отправки.
    S.recordedBlob = rawBlob;
  }
  S.recordedUrl = URL.createObjectURL(S.recordedBlob);
  preview.src = S.recordedUrl;
  preview.muted = false;
  preview.controls = true;
  preview.loop = true;
  playQuietly(preview);
  // iOS Safari игнорирует controlsList="nofullscreen" и может открыть системный fullscreen по тапу - сразу закрываем.
  preview.addEventListener('webkitbeginfullscreen', () => {
    if(preview.webkitExitFullscreen) preview.webkitExitFullscreen();
  });
  showRecordingControls(false);
}
