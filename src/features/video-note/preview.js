// ===================== features/video-note/preview.js =====================
// Судьба записанного ролика после остановки: отпустить blob-URL, стереть
// превью без отправки или отправить тем же путём, что голосовые/файлы.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { uploadAndSend } from '../../net/upload.js';
import { S } from './state.js';
import { showModal } from './ui.js';
import { t } from '../../i18n/t.js';

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
  // .webm - единственное расширение, которое реально пишет MediaRecorder
  // в поддерживаемых браузерах (см. recording.js/pickMimeType);
  // net/media/mime-kind.js определяет по нему kind='video' как для обычных
  // видео-сообщений, а префикс "videonote-" в имени файла отличает кружок
  // для круглого рендера в чате (см. ui/chat-view/bubble-renderers.js,
  // media-loader.js).
  const file = new File([S.recordedBlob], 'videonote-' + Date.now() + '.webm', {type: S.recordedBlob.type || 'video/webm'});
  // Превью снято ещё в recording-stop.js прямо с канваса записи (см. там
  // комментарий) - забираем ДО releasePreviewBlob(), которая его обнулит.
  const thumbnailB64url = S.recordedThumbB64url;
  releasePreviewBlob();
  showModal(false);
  if(!state.activeChat){ toast(t('videoNote.chatClosedNotSent')); return; }
  uploadAndSend(file, undefined, { thumbnailB64url });
}
