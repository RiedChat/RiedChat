// ============ features/message-search/thumb-loader.js ============
// Ленивая расшифровка фото/видео при попадании в область видимости.
import { $ } from '../../core/dom-utils.js';
import { html, setHTML } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';
import { media } from '../../net/media.js';
import { applyVideoPoster } from '../../ui/chat-view/video-poster/index.js';

import { thumbFallbackHtml } from './format.js';

let thumbObserver = null;

// Скачивает и расшифровывает (для обычной https-картинки - берёт исходный URL) и заменяет плейсхолдер превью.
async function loadThumb(host, info, senderJid){
  try{
    const blobUrl = info.encrypted
      ? (await media.decrypt(info.url, null, senderJid)).blobUrl
      : info.url;
    if(!blobUrl) throw new Error(t('search.decryptFailed'));
    if(!document.body.contains(host)) return; // список перерисован/модалка закрыта
    if(info.kind === 'image'){
      setHTML(host, html`<img src="${blobUrl}" loading="lazy">`);
    } else {
      setHTML(host, html`<video src="${blobUrl}#t=0.001" muted preload="metadata" playsinline></video>`);
      const videoEl = host.querySelector('video');
      if(videoEl){
        // Как в media-loader/encrypted-media.js: кадр, встроенный отправителем в ссылку (extractThumbDataUrl); без него - кадр от #t=0.001.
        applyVideoPoster(videoEl, info.url);
      }
    }
  }catch{
    if(document.body.contains(host)) setHTML(host, thumbFallbackHtml(info));
  }
}

export function observeThumb(host, info, senderJid){
  if(!thumbObserver){
    thumbObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(!entry.isIntersecting) return;
        thumbObserver.unobserve(entry.target);
        loadThumb(entry.target, entry.target.__mediaInfo, entry.target.__senderJid);
      });
    }, { root: $('search-results'), rootMargin: '150px' });
  }
  host.__mediaInfo = info;
  host.__senderJid = senderJid;
  thumbObserver.observe(host);
}

export function resetThumbObserver(){
  if(thumbObserver) thumbObserver.disconnect();
}
