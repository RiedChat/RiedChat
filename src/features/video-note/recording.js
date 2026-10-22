// ===================== features/video-note/recording.js =====================
// Кружки (круглые видео-сообщения, как в Telegram): запись с камеры и микрофона через MediaRecorder, лимит 1 минута (автостоп через recording-stop.js/stopAndShowPreview).
// Открывается КОРОТКИМ тапом по кнопке микрофона; долгое зажатие (>=1,5с) - голосовое (features/voice-recorder/recorder.js, разбор жеста - voice-recorder/gesture.js).
//
// Запись через canvas, а не напрямую с камеры: MediaRecorder привязан к MediaStreamTrack при создании, подмена видеотрека
// на лету (переключение камеры, camera.js/switchCamera) не подхватывается. Камера рисуется в скрытый <canvas> (canvas.js/drawFrame, rAF),
// пишется поток с canvas (captureStream); источник кадров меняется сменой srcObject у <video id="video-note-preview">,
// треки рекордера не трогаются - запись не рвётся, в аудио нет паузы/склейки.
//
// Остановка (onRecorderStop) и команды стоп/отмена - recording-stop.js.
import { detectMultipleCameras } from '../../core/camera.js';
import { $, toast, formatMmSs, playQuietly } from '../../core/dom-utils.js';
import { makeCanvas } from '../../core/image-utils.js';
import { getMedia, tryCreateRecorder } from '../../core/recorder.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

import { cameraConstraints, stopStream } from './camera.js';
import { drawFrame } from './canvas.js';
import { releasePreviewBlob } from './preview.js';
import { onRecorderStop, stopAndShowPreview } from './recording-stop.js';
import { S, MAX_DURATION_MS, CANVAS_SIZE } from './state.js';
import { showModal, showRecordingControls } from './ui.js';


const VIDEO_MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export async function startVideoNoteRecording(){
  if(!state.activeChat){ toast(t('videoNote.selectContactFirst')); return; }
  S.currentFacingMode = 'user'; // каждая запись начинается с фронтальной камеры
  S.stream = await getMedia(
    { video: cameraConstraints(S.currentFacingMode), audio: true },
    'videoNote.notSupported',
    'videoNote.noCameraAccess',
  );
  if(!S.stream) return;
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
  playQuietly(preview);

  const switchBtn = $('video-note-switch-cam-btn');
  switchBtn.hidden = true; // до подтверждения, что камер несколько
  detectMultipleCameras().then(has => { switchBtn.hidden = !has; });

  S.canvasEl = S.canvasEl || makeCanvas(CANVAS_SIZE, CANVAS_SIZE);
  S.canvasEl.width = CANVAS_SIZE;
  S.canvasEl.height = CANVAS_SIZE;
  S.canvasCtx = S.canvasEl.getContext('2d');
  if(S.rafHandle) cancelAnimationFrame(S.rafHandle);
  drawFrame();

  S.canvasStream = S.canvasEl.captureStream(30);
  const audioTrack = S.stream.getAudioTracks()[0];
  if(audioTrack) S.canvasStream.addTrack(audioTrack);

  S.mediaRecorder = tryCreateRecorder(S.canvasStream, VIDEO_MIME_CANDIDATES, S.chunks, 'videoNote.startFailed');
  if(!S.mediaRecorder){ stopStream(); return; }
  S.mediaRecorder.addEventListener('stop', onRecorderStop);
  S.mediaRecorder.start();
  S.startedAt = Date.now();

  $('video-note-circle').style.setProperty('--progress', '0');
  $('video-note-timer').textContent = '0:00 / 1:00';
  showRecordingControls(true);
  showModal(true);

  S.timerHandle = setInterval(() => {
    const elapsed = Date.now() - S.startedAt;
    $('video-note-timer').textContent = formatMmSs(elapsed / 1000) + ' / 1:00';
    $('video-note-circle').style.setProperty('--progress', String(Math.min(100, elapsed / MAX_DURATION_MS * 100)));
  }, 200);
  // Лимит 1 минута: затем автозавершение и тот же предпросмотр, что при ручном стопе.
  S.autoStopHandle = setTimeout(stopAndShowPreview, MAX_DURATION_MS);
}
