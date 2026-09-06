// ===================== features/voice-recorder/gesture.js =====================
// Жест на кнопке микрофона: короткий тап vs зажатие ≥3с. pointerdown
// запускает таймер на AUDIO_HOLD_THRESHOLD_MS. Если он успевает сработать,
// пока кнопка ещё нажата, - это зажатие: стартует запись голосового
// (recorder.startRecording). Если пользователь отпускает кнопку РАНЬШЕ, чем
// сработал таймер, - это короткий тап: открываем запись кружка
// (video-note.js). pointerleave/pointercancel до срабатывания таймера
// просто гасят жест, ничего не запуская (чтобы случайный свайп с кнопки не
// стартовал запись).
import { $ } from '../../core/dom-utils.js';
import { AUDIO_HOLD_THRESHOLD_MS } from './state.js';

export function wireMicGesture(recorder){
  let holdTimer = null;
  let holdFired = false;
  let pressActive = false;

  function clearHoldTimer(){
    if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
  }
  function onMicPointerDown(e){
    if(typeof e.button === 'number' && e.button !== 0) return; // только левая кнопка мыши/тач/перо
    pressActive = true;
    holdFired = false;
    clearHoldTimer();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdFired = true;
      if(pressActive) recorder.startRecording();
    }, AUDIO_HOLD_THRESHOLD_MS);
  }
  function onMicPointerUp(){
    const wasHeldLongEnough = holdFired;
    pressActive = false;
    clearHoldTimer();
    // Если порог не сработал - короткий тап, запускаем кружок. Если сработал -
    // голосовое уже стартовало по таймеру, отпускание кнопки его не трогает:
    // запись продолжается до явного нажатия на "отправить"/"отменить" выше.
    // Кружок открывается редко относительно голосовых - не тянем весь
    // features/video-note/* в основной чанк ради одного короткого тапа.
    if(!wasHeldLongEnough) import('../video-note.js').then(m => m.startVideoNoteRecording());
  }
  function onMicPointerCancel(){
    pressActive = false;
    clearHoldTimer();
  }

  $('mic-btn').addEventListener('pointerdown', onMicPointerDown);
  $('mic-btn').addEventListener('pointerup', onMicPointerUp);
  $('mic-btn').addEventListener('pointerleave', onMicPointerCancel);
  $('mic-btn').addEventListener('pointercancel', onMicPointerCancel);
}
