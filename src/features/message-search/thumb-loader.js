// ============ features/message-search/thumb-loader.js ============
// Лениво расшифровываем фото/видео, только когда они реально попали
// в область видимости списка результатов.
import { $ } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { media } from '../../net/media.js';
import { setPreviewPoster } from '../../ui/chat-view/video-poster.js';
import { thumbFallbackHtml } from './format.js';
import { t } from '../../i18n/t.js';

let thumbObserver = null;

// Скачивает и расшифровывает (или, для обычной https-картинки, просто
// подставляет исходный URL) и подменяет плейсхолдер на настоящее превью.
async function loadThumb(host, info, senderJid){
  try{
    const blobUrl = info.encrypted
      ? (await media.decrypt(info.url, null, senderJid)).blobUrl
      : info.url;
    if(!blobUrl) throw new Error(t('search.decryptFailed'));
    if(!document.body.contains(host)) return; // список уже перерисован/модалка закрыта
    if(info.kind === 'image'){
      setHTML(host, html`<img src="${blobUrl}" loading="lazy">`);
    } else {
      setHTML(host, html`<video src="${blobUrl}" muted preload="metadata" playsinline></video>`);
      const videoEl = host.querySelector('video');
      if(videoEl){
        // Как и в media-loader/encrypted-media.js: сперва пробуем кадр,
        // встроенный отправителем прямо в ссылку (media.extractThumbDataUrl) -
        // это надёжно всегда, включая кружки. Постфактумный setPreviewPoster
        // (перемотка/захват уже скачанного файла) для кружков (webm без
        // индекса ключевых кадров из MediaRecorder) на части браузеров не
        // срабатывает вовсе, поэтому без этой проверки превью кружков в
        // поиске часто оставалось пустым - используем его только как fallback.
        const embeddedThumb = media.extractThumbDataUrl(info.url);
        if(embeddedThumb) videoEl.poster = embeddedThumb;
        else setPreviewPoster(videoEl, {skipSeek: info.category === 'videonote'});
      }
    }
  }catch(e){
    if(document.body.contains(host)) setHTML(host, raw(thumbFallbackHtml(info)));
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
