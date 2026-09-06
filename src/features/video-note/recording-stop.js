// ================ features/video-note/recording-stop.js ================
// Обработчик события "stop" MediaRecorder: собирает записанные чанки в Blob
// и показывает предпросмотр, либо просто закрывает модалку, если запись
// была отменена (S.discardOnStop) или чанков не оказалось.
import fixWebmDuration from 'fix-webm-duration';
import { $ } from '../../core/dom-utils.js';
import { S } from './state.js';
import { stopStream } from './camera.js';
import { showModal, showRecordingControls } from './ui.js';
import { encodeThumbFromSource } from '../../net/media/thumb-codec.js';

// Кружки - ровно тот случай, для которого постфактумный захват кадра из
// готового webm ненадёжен (см. комментарий в шапке recording.js и в
// ui/chat-view/video-poster/index.js: MediaRecorder не пишет индекс
// кадров, currentTime на таких файлах браузер молча игнорирует). Но нам и
// не нужно ничего доставать из готового файла: во время записи мы и так
// уже рисуем каждый кадр в S.canvasEl (см. canvas.js/drawFrame) - канвас
// хранит последний нарисованный кадр вплоть до следующей записи, поэтому
// превью можно просто снять с него, ДО stopStream(), одним синхронным
// toDataURL(), без какого-либо декодирования видео.
const THUMB_MAX_DIM = 240;

function captureCanvasThumb(){
  try{
    if(!S.canvasEl) return null;
    return encodeThumbFromSource(S.canvasEl, THUMB_MAX_DIM);
  }catch(e){
    return null;
  }
}

// MediaRecorder пишет webm БЕЗ длительности в заголовке (Segment/Info идёт с
// unknown-size, известное ограничение самого API, а не наш баг) - именно
// из-за этого у кружков вообще не работала перемотка/прогресс-бар и не
// захватывался кадр-превью нормальным способом (currentTime молча
// игнорировался браузером). fix-webm-duration патчит уже готовый blob:
// дописывает Duration в Segment/Info по измеренному нами реальному времени
// записи (S.startedAt) - после этого кружок ведёт себя как обычный video-файл
// с корректной длительностью и рабочей перемоткой.
export async function onRecorderStop(){
  const usedMimeType = (S.mediaRecorder && S.mediaRecorder.mimeType) || 'video/webm';
  // Снимаем превью ДО stopStream(): последний кадр ещё лежит в канвасе -
  // stopStream() сам канвас не трогает (только останавливает треки), но
  // нет смысла зависеть от порядка, если запись всё равно отменяется.
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
  }catch(e){
    // Патчинг - это just байтовая правка уже готового файла, а не
    // повторное кодирование, так что почти никогда не должен падать; но
    // если браузер прислал что-то совсем не по спеке EBML - лучше кружок
    // без рабочей перемотки, чем полный отказ отправки сообщения.
    S.recordedBlob = rawBlob;
  }
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
