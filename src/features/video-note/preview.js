// ===================== features/video-note/preview.js =====================
// Судьба записанного ролика: освободить blob-URL, стереть превью без отправки или отправить как голосовые/файлы.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { uploadAndSend } from '../../net/upload.js';

import { S } from './state.js';
import { showModal } from './ui.js';

export function releasePreviewBlob(){
  if(S.recordedUrl){ URL.revokeObjectURL(S.recordedUrl); S.recordedUrl = null; }
  S.recordedBlob = null;
  S.recordedThumbB64url = null;
}

export function discardPreview(){
  releasePreviewBlob();
  const preview = $('video-note-preview');
  preview.removeAttribute('src');
  preview.load();
  showModal(false);
}

export function sendPreview(){
  if(!S.recordedBlob){ showModal(false); return; }
  // .webm - единственное расширение MediaRecorder в поддерживаемых браузерах (recording.js/pickMimeType); net/media/mime-kind.js по нему даёт kind="video".
  // Префикс "videonote-" отличает кружок для круглого рендера (ui/chat-view/bubble-renderers.js, media-loader/encrypted-media.js).
  const file = new File([S.recordedBlob], 'videonote-' + Date.now() + '.webm', {type: S.recordedBlob.type || 'video/webm'});
  // Превью снято в recording-stop.js с канваса записи - забираем ДО releasePreviewBlob(), которая его обнулит.
  const thumbnailB64url = S.recordedThumbB64url;
  releasePreviewBlob();
  showModal(false);
  if(!state.activeChat){ toast(t('videoNote.chatClosedNotSent')); return; }
  uploadAndSend(file, undefined, { thumbnailB64url });
}
