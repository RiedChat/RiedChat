// ===================== features/video-note/recording.js =====================
// Круглые видео-сообщения ("кружки", как в Telegram): запуск записи с камеры
// и микрофона через MediaRecorder в реальном времени, лимит 1 минута (по
// истечении - автостоп через recording-controls.js/stopAndShowPreview).
//
// Открывается КОРОТКИМ тапом по кнопке микрофона - в отличие от долгого
// зажатия (≥3с), которое запускает обычную запись голосового сообщения
// (см. features/voice-recorder.js, там же живёт разбор жеста нажатия).
//
// ЗАПИСЬ ЧЕРЕЗ CANVAS, А НЕ НАПРЯМУЮ С КАМЕРЫ: MediaRecorder привязывается к
// конкретным MediaStreamTrack-объектам в момент создания - подменить видеотрек
// "на лету" (переключить камеру посреди записи, см. camera.js/switchCamera) у
// уже запущенного рекордера нельзя, замена трека в исходном MediaStream
// рекордер просто не подхватывает. Поэтому камера рисуется в скрытый
// <canvas> (canvas.js/drawFrame, requestAnimationFrame), а пишется поток
// С CANVAS (canvas.captureStream) - свапнуть источник кадров для канваса
// можно в любой момент (drawFrame читает пиксели текущего
// <video id="video-note-preview">, которому достаточно поменять srcObject),
// и ни видео-, ни аудиотрек самого MediaRecorder при этом не трогаются -
// переключение камеры не рвёт запись и не даёт паузы/склейки в аудио.
//
// Обработка остановки - в recording-stop.js (onRecorderStop), команды
// управления (стоп/отмена) - в recording-controls.js.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { S, MAX_DURATION_MS, CANVAS_SIZE } from './state.js';
import { drawFrame } from './canvas.js';
import { detectMultipleCameras, stopStream } from './camera.js';
import { fmtTime, showModal, showRecordingControls } from './ui.js';
import { releasePreviewBlob } from './preview.js';
import { onRecorderStop } from './recording-stop.js';
import { stopAndShowPreview } from './recording-controls.js';
import { t } from '../../i18n/t.js';

export { stopAndShowPreview, cancelRecording } from './recording-controls.js';

const St = state;

function pickMimeType(){
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for(const t of candidates){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export async function startVideoNoteRecording(){
  if(!St.activeChat){ toast(t('videoNote.selectContactFirst')); return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast(t('videoNote.notSupported')); return;
  }
  S.currentFacingMode = 'user'; // каждая новая запись начинается с фронтальной камеры
  try{
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: S.currentFacingMode, width: {ideal: 480}, height: {ideal: 480}, aspectRatio: 1 },
      audio: true
    });
  }catch(e){
    // e.message у DOMException часто пустой - реальная причина в e.name
    // (NotAllowedError / NotFoundError / NotReadableError / SecurityError и т.п.)
    const detail = (e && e.name ? e.name : '') + (e && e.message ? ': ' + e.message : (e ? String(e) : ''));
    toast(t('videoNote.noCameraAccess', { detail }));
    return;
  }
  S.discardOnStop = false;
  S.chunks = [];
  releasePreviewBlob();

  const preview = $('video-note-preview');
  preview.removeAttribute('src');
  preview.srcObject = S.stream;
  preview.muted = true;
  preview.controls = false;
  preview.loop = false;
  preview.classList.add('mirrored');
  preview.play().catch(() => {});

  const switchBtn = $('video-note-switch-cam-btn');
  switchBtn.hidden = true; // до подтверждения, что камер реально несколько
  detectMultipleCameras().then(has => { switchBtn.hidden = !has; });

  S.canvasEl = S.canvasEl || document.createElement('canvas');
  S.canvasEl.width = CANVAS_SIZE;
  S.canvasEl.height = CANVAS_SIZE;
  S.canvasCtx = S.canvasEl.getContext('2d');
  if(S.rafHandle) cancelAnimationFrame(S.rafHandle);
  drawFrame();

  S.canvasStream = S.canvasEl.captureStream(30);
  const audioTrack = S.stream.getAudioTracks()[0];
  if(audioTrack) S.canvasStream.addTrack(audioTrack);

  const mimeType = pickMimeType();
  try{
    S.mediaRecorder = mimeType ? new MediaRecorder(S.canvasStream, {mimeType}) : new MediaRecorder(S.canvasStream);
  }catch(e){
    toast(t('videoNote.startFailed', { error: e && e.message ? e.message : e }));
    stopStream();
    return;
  }
  S.mediaRecorder.addEventListener('dataavailable', (e) => { if(e.data && e.data.size > 0) S.chunks.push(e.data); });
  S.mediaRecorder.addEventListener('stop', onRecorderStop);
  S.mediaRecorder.start();
  S.startedAt = Date.now();

  $('video-note-circle').style.setProperty('--progress', '0');
  $('video-note-timer').textContent = '0:00 / 1:00';
  showRecordingControls(true);
  showModal(true);

  S.timerHandle = setInterval(() => {
    const elapsed = Date.now() - S.startedAt;
    $('video-note-timer').textContent = fmtTime(elapsed) + ' / 1:00';
    $('video-note-circle').style.setProperty('--progress', String(Math.min(100, elapsed / MAX_DURATION_MS * 100)));
  }, 200);
  // Лимит кружка - 1 минута: по истечении запись автоматически завершается
  // и пользователю показывается тот же предпросмотр, что и при ручном стопе.
  S.autoStopHandle = setTimeout(stopAndShowPreview, MAX_DURATION_MS);
}
