// =============== ui/chat-view/video-poster/index.js ===============
// Постер <video> из превью, встроенного отправителем в ссылку (net/media/thumb-codec.js). Нет превью - постера нет: браузер сам покажет кадр по #t=0.001 в src.
import { embeddedThumb } from '../media-traits.js';

export function applyVideoPoster(videoEl, aesgcmUrl){
  if(!videoEl) return;
  const embedded = embeddedThumb('video', aesgcmUrl);
  if(embedded) videoEl.poster = embedded;
}
