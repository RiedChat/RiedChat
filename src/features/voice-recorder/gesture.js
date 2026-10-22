// ===================== features/voice-recorder/gesture.js =====================
// Жест на кнопке микрофона: pointerdown запускает таймер AUDIO_HOLD_THRESHOLD_MS.
// Таймер сработал при нажатой кнопке - зажатие, старт голосового (recorder.startRecording).
// Отпускание раньше таймера - короткий тап, открывается кружок (video-note.js).
// pointerleave/pointercancel до таймера гасят жест.
import { $ } from '../../core/dom-utils.js';

// Порог удержания: короткий тап - кружок, удержание ≥1,5с - голосовое.
const AUDIO_HOLD_THRESHOLD_MS = 1500;

export function wireMicGesture(recorder){
  const btn = $('mic-btn');
  let holdTimer = null;
  let holdFired = false;

  const clearHoldTimer = () => { clearTimeout(holdTimer); holdTimer = null; };

  btn.addEventListener('pointerdown', (e) => {
    if(typeof e.button === 'number' && e.button !== 0) return; // только левая кнопка/тач/перо
    holdFired = false;
    clearHoldTimer();
    holdTimer = setTimeout(() => { holdFired = true; recorder.startRecording(); }, AUDIO_HOLD_THRESHOLD_MS);
  });
  btn.addEventListener('pointerup', () => {
    clearHoldTimer();
    // Порог не сработал - тап, запускаем кружок. Сработал - голосовое уже идёт, отпускание его не трогает
    // (запись до явного "отправить"/"отменить"). Кружок грузим лениво, чтобы не тянуть video-note/* в основной чанк.
    if(!holdFired) import('../video-note.js').then(m => m.startVideoNoteRecording());
  });
  btn.addEventListener('pointerleave', clearHoldTimer);
  btn.addEventListener('pointercancel', clearHoldTimer);
}
