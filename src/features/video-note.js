// ===================== features/video-note.js =====================
// Публичная точка входа кружков (видео-сообщений). Модули features/video-note/*: state.js (состояние), canvas.js (круглая отрисовка кадра), camera.js (поток/переключение камеры),
// recording.js (запуск записи), recording-stop.js (стоп/отмена, обработка остановки), preview.js (отправка/отмена), ui.js (модалка).
// startVideoNoteRecording вызывается из voice-recorder/gesture.js по короткому тапу, wireVideoNote - из app.js при старте.
import { $ } from '../core/dom-utils.js';

import { switchCamera } from './video-note/camera.js';
import { discardPreview, sendPreview } from './video-note/preview.js';
import { stopAndShowPreview, cancelRecording } from './video-note/recording-stop.js';
import { startVideoNoteRecording } from './video-note/recording.js';
import { S } from './video-note/state.js';

export { startVideoNoteRecording };

export function wireVideoNote(){
  $('video-note-stop-btn').addEventListener('click', stopAndShowPreview);
  $('video-note-cancel-btn').addEventListener('click', cancelRecording);
  $('video-note-switch-cam-btn').addEventListener('click', switchCamera);
  $('video-note-discard-btn').addEventListener('click', discardPreview);
  $('video-note-send-btn').addEventListener('click', sendPreview);
  // Клик по тёмному оверлею вокруг круга при предпросмотре - отмена; во время записи игнорируем, чтобы случайный тап не обрывал запись.
  $('video-note-modal').addEventListener('click', (e) => {
    if(e.target !== e.currentTarget) return;
    if(S.recordedBlob) discardPreview();
  });
}
