// ===================== features/video-note/ui.js =====================
// DOM-хелперы модалки кружка.
import { $ } from '../../core/dom-utils.js';

export function showModal(v){
  $('video-note-modal').classList.toggle('active', v);
}

export function showRecordingControls(v){
  $('video-note-record-controls').hidden = !v;
  $('video-note-preview-controls').hidden = v;
}
