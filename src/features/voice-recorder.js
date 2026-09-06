// ===================== features/voice-recorder.js =====================
// Публичная точка входа записи голосовых сообщений. Реализация разбита по
// смыслу на features/voice-recorder/*: state.js (порог удержания кнопки),
// format.js (mime-тип, форматирование времени), recorder.js (жизненный
// цикл MediaRecorder и отправка тем же путём, что и обычные файлы),
// gesture.js (жест тап/зажатие на кнопке микрофона). Наружу отдаём только
// wireVoiceRecorder - вызывается из app.js при старте.
import { $ } from '../core/dom-utils.js';
import { createVoiceRecorder } from './voice-recorder/recorder.js';
import { wireMicGesture } from './voice-recorder/gesture.js';

export function wireVoiceRecorder(){
  const recorder = createVoiceRecorder();
  wireMicGesture(recorder);

  $('stop-record-btn').addEventListener('click', recorder.stopAndSend);
  $('cancel-record-btn').addEventListener('click', recorder.stopAndCancel);
}
