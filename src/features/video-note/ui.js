// ===================== features/video-note/ui.js =====================
// Мелкие DOM-хелперы модалки кружка и разводка обработчиков кнопок.
import { $ } from '../../core/dom-utils.js';
import { S } from './state.js';
import { stopAndShowPreview, cancelRecording } from './recording.js';
import { switchCamera } from './camera.js';
import { discardPreview, sendPreview } from './preview.js';

export function fmtTime(ms){
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return mm + ':' + ss;
}

export function showModal(v){
  $('video-note-modal').classList.toggle('active', v);
}

export function showRecordingControls(v){
  $('video-note-record-controls').style.display = v ? 'flex' : 'none';
  $('video-note-preview-controls').style.display = v ? 'none' : 'flex';
}

export function wireVideoNote(){
  $('video-note-stop-btn').addEventListener('click', stopAndShowPreview);
  $('video-note-cancel-btn').addEventListener('click', cancelRecording);
  $('video-note-switch-cam-btn').addEventListener('click', switchCamera);
  $('video-note-discard-btn').addEventListener('click', discardPreview);
  $('video-note-send-btn').addEventListener('click', sendPreview);
  // Клик по оверлею (тёмному фону вокруг круга) во время предпросмотра -
  // как отмена; во время самой записи оверлей игнорируем, чтобы случайный
  // тап мимо круга не обрывал запись.
  $('video-note-modal').addEventListener('click', (e) => {
    if(e.target !== e.currentTarget) return;
    if(S.recordedBlob) discardPreview();
  });
}
