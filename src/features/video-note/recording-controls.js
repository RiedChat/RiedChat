// ============== features/video-note/recording-controls.js ==============
// Команды управления активной записью: штатная остановка (с показом
// предпросмотра через onRecorderStop) и отмена (без сохранения).
import { S } from './state.js';
import { stopStream } from './camera.js';
import { showModal } from './ui.js';

export function stopAndShowPreview(){
  if(S.mediaRecorder && S.mediaRecorder.state !== 'inactive'){ S.discardOnStop = false; S.mediaRecorder.stop(); }
}

export function cancelRecording(){
  if(S.mediaRecorder && S.mediaRecorder.state !== 'inactive'){ S.discardOnStop = true; S.mediaRecorder.stop(); }
  else{ stopStream(); showModal(false); }
}
