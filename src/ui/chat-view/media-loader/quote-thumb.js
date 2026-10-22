// ============= ui/chat-view/media-loader/quote-thumb.js =============
import { html, setHTML } from '../../../core/safe-html.js';
import { applyVideoPoster } from '../video-poster/index.js';

import { deferUntilTap, decryptInto } from './defer-until-tap.js';

// Миниатюра медиа внутри цитаты (message-body-html.js:quoteThumb). Тот же media.decrypt() и in-memory кэш, что у loadEncryptedMedia, - без повторной загрузки. Без прогресса, плеера и плашки: только картинка/кадр.
async function loadQuoteThumb(host, aesgcmUrl, senderJid){
  const entry = await decryptInto(host, aesgcmUrl, null, senderJid);
  if(!entry) return; // сообщение перерисовано/удалено
  if(entry.status === 'error'){
    // При ошибке молча прячем миниатюру: текстовая метка цитаты остаётся, заглушка с ошибкой была бы слишком заметна.
    host.remove();
    return;
  }
  const {blobUrl, kind: realKind} = entry;
  if(realKind === 'image'){
    setHTML(host, html`<img src="${blobUrl}">`);
  } else if(realKind === 'video'){
    setHTML(host, html`<video src="${blobUrl}#t=0.001" muted playsinline preload="auto"></video>`);
    // Превью из ссылки (thumb-codec.js/upload.js); без него - кадр от #t=0.001 (см. encrypted-media.js).
    applyVideoPoster(host.querySelector('video'), aesgcmUrl);
  } else {
    host.remove();
  }
}

// Миниатюра в цитате с учётом автозагрузки: при holdOff - клик вместо немедленной расшифровки, как в loadDeferredMedia.
export function loadQuoteThumbOrDefer(host, aesgcmUrl, senderJid, holdOff){
  deferUntilTap(host, {
    holdOff,
    cachedUrl: aesgcmUrl,
    start: () => loadQuoteThumb(host, aesgcmUrl, senderJid),
  });
}
