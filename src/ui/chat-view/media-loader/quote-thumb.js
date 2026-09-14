// ============= ui/chat-view/media-loader/quote-thumb.js =============
import { html, setHTML } from '../../../core/safe-html.js';
import { history } from '../../../net/history.js';
import { media } from '../../../net/media.js';
import { setPreviewPoster } from '../video-poster.js';

// Миниатюра фото/видео/кружка/стикера ВНУТРИ самой цитаты (см.
// ui/chat-view/message-body-html.js:formatMessageBody) - использует тот же
// media.decrypt() и тот же in-memory кэш, что и полноразмерный рендер медиа
// (loadEncryptedMedia, см. encrypted-media.js), поэтому если то же вложение
// уже показывается где-то в чате как основное сообщение, повторно
// скачивать/расшифровывать не придётся. В отличие от loadEncryptedMedia,
// здесь нет ни прогресса, ни плеера с controls, ни плашки "нажмите, чтобы
// загрузить" - только сама картинка/кадр, максимально компактно.
export async function loadQuoteThumb(placeholderId, aesgcmUrl, kind, isNote, senderJid){
  const entry = await media.decrypt(aesgcmUrl, null, senderJid);
  const host = document.getElementById(placeholderId);
  if(!host) return; // сообщение уже перерисовано/удалено
  if(entry.status === 'error'){
    // Рядом всё равно остаётся текстовая метка цитаты (📷 Фото и т.п.) -
    // молча прячем несостоявшуюся миниатюру, а не рисуем в цитате заглушку
    // с ошибкой (для маленького превью это было бы слишком заметно/некрасиво).
    host.remove();
    return;
  }
  const {blobUrl, kind: realKind} = entry;
  if(realKind === 'image'){
    setHTML(host, html`<img src="${blobUrl}">`);
  } else if(realKind === 'video'){
    setHTML(host, html`<video src="${blobUrl}" muted playsinline preload="auto"></video>`);
    const videoEl = host.querySelector('video');
    // Предпочитаем превью, встроенное отправителем в саму ссылку (см.
    // net/media/thumb-codec.js/net/upload.js) - готовый кадр с несжатого
    // оригинала, а не выковырянный постфактум из уже скачанного файла.
    // Постфактумный захват (setPreviewPoster) - fallback для сообщений
    // без встроенного превью (см. подробный комментарий в encrypted-media.js).
    if(videoEl){
      const embeddedThumb = media.extractThumbDataUrl(aesgcmUrl);
      if(embeddedThumb) videoEl.poster = embeddedThumb;
      else setPreviewPoster(videoEl, {skipSeek: !!isNote});
    }
  } else {
    host.remove();
  }
}

// Миниатюра в цитате (см. loadQuoteThumb выше) с учётом настройки
// автозагрузки (features/image-settings.js) - если holdOff, вешаем на
// плейсхолдер обработчик клика вместо немедленной расшифровки, по той же
// схеме, что и _loadMediaOrDeferForVideo (см. video-defer.js).
export function _loadQuoteThumbOrDefer(placeholderId, aesgcmUrl, kind, isNote, senderJid, holdOff){
  if(!holdOff){
    loadQuoteThumb(placeholderId, aesgcmUrl, kind, isNote, senderJid);
    return;
  }
  const host = document.getElementById(placeholderId);
  if(!host){ loadQuoteThumb(placeholderId, aesgcmUrl, kind, isNote, senderJid); return; }
  let started = false;
  const startLoad = () => {
    if(started) return;
    started = true;
    host.classList.remove('image-tap-load', 'video-tap-load');
    loadQuoteThumb(placeholderId, aesgcmUrl, kind, isNote, senderJid);
  };
  host.addEventListener('click', startLoad, {once: true});
  // Как и в _loadMediaOrDeferForVideo: если файл уже есть в постоянном
  // кэше (скачан раньше), догружаем сразу, без ожидания тапа.
  if(history && history.hasMediaEntry){
    history.hasMediaEntry(aesgcmUrl).then(has => { if(has) startLoad(); }).catch(() => {});
  }
}
