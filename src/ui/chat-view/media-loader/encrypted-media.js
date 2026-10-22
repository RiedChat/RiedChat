// ============ ui/chat-view/media-loader/encrypted-media.js ============
// Скачивает и расшифровывает aesgcm://, подменяет плейсхолдер на <img>/<video>/<audio> с blob-URL (или ссылкой-фолбэком при ошибке).
import { $, isNearBottom, scrollToBottom } from '../../../core/dom-utils.js';
import { icon } from '../../../core/icons.js';
import { html, raw, setHTML } from '../../../core/safe-html.js';
import { t } from '../../../i18n/t.js';
import { fileNameOf } from '../../../net/media/mime-kind.js';
import { mountVoicePlayer } from '../../voice-player/mount.js';
import { videoBoxClass, imageLinkHtml, loadingHtml, loadingPercentText, GLYPH_LOADING, BLANK_LINK_ATTRS } from '../media-placeholder.js';
import { mediaTraits } from '../media-traits.js';
import { applyVideoPoster } from '../video-poster/index.js';

import { deferUntilTap, decryptInto } from './defer-until-tap.js';

const GUESSED_EXT = { image: '.jpg', video: '.mp4', audio: '.mp3' };

// Прижимаем список к низу в двух кадрах: второй нужен фото/видео, чьи размеры применяются к layout не сразу.
function rescrollToBottom(messagesEl){
  requestAnimationFrame(() => {
    scrollToBottom(messagesEl);
    requestAnimationFrame(() => scrollToBottom(messagesEl));
  });
}

// Видео. Кружок - круглый плеер без рамки 16:9, с кнопкой «на весь экран» (.media-expand-btn). Определяем по ссылке (isVideoNote), а не по .bubble.video-note: кружок с цитатой рендерится текстовым пузырём.
// Обычное видео - рамка 16:9 через padding-top (aspect-ratio не везде в старых WebView), object-fit:cover. preload="auto": файл уже скачан, а "metadata" во многих браузерах не декодирует кадр до Play.
function renderVideo(host, blobUrl, aesgcmUrl){
  const { isNote: isNoteVideo } = mediaTraits(aesgcmUrl, 'video');
  setHTML(host, html`<div class="${videoBoxClass(isNoteVideo)}"><video src="${blobUrl}#t=0.001" controls preload="auto" playsinline${raw(isNoteVideo ? ' loop' : '')}></video><button type="button" class="media-expand-btn" title="${t('media.openFullscreen')}">${raw(icon('expand'))}</button></div>`);
  // Превью: встроенное в ссылку (thumb-codec.js, upload.js; для кружков - с канваса записи, recording-stop.js). Без него браузер сам показывает кадр благодаря #t=0.001 в src.
  applyVideoPoster(host.querySelector('video'), aesgcmUrl);
}

// Подмена плейсхолдера результатом (или фолбэком при ошибке).
function renderDecrypted(host, entry, { aesgcmUrl, isMediaOnly, bubble }){
  if(entry.status === 'error'){
    if(isMediaOnly) host.classList.add('media-frame-error'); // фолбэку нужны свои отступы
    setHTML(host, html`<a href="${aesgcmUrl}" ${BLANK_LINK_ATTRS}>${raw(icon('paper-clip'))} ${t('media.decryptFailed')}</a>`);
    if(bubble){ bubble.dataset.kind = 'text'; delete bubble.dataset.downloadUrl; delete bubble.dataset.downloadName; }
    return;
  }
  const { blobUrl, kind } = entry;
  // Имя файла - из ссылки (fileNameOf режет хвост с ключом), а не из blob-URL.
  const downloadName = fileNameOf(aesgcmUrl) || (kind + (GUESSED_EXT[kind] || ''));
  if(bubble){
    bubble.dataset.kind = kind;
    bubble.dataset.downloadUrl = blobUrl;
    bubble.dataset.downloadName = downloadName;
  }
  if(kind === 'image'){
    setHTML(host, imageLinkHtml(blobUrl));
  } else if(kind === 'video'){
    renderVideo(host, blobUrl, aesgcmUrl);
  } else if(kind === 'audio'){
    mountVoicePlayer(host, blobUrl);
  } else {
    if(isMediaOnly) host.classList.add('media-frame-file');
    // download="${downloadName}" обязателен: иначе браузер подставит blob-идентификатор. То же имя показываем в превью-ссылке.
    setHTML(host, html`<a href="${blobUrl}" ${BLANK_LINK_ATTRS} download="${downloadName}" class="file-download-link">${raw(icon('paper-clip'))} <span class="file-download-name">${downloadName}</span></a>`);
  }
}

async function loadEncryptedMedia(host, aesgcmUrl, senderJid){
  const messagesEl = $('messages');
  // Запоминаем до загрузки, был ли список внизу: после замены плейсхолдера на фото/видео высота пузыря растёт, и низ нужно прижать снова.
  const wasNearBottom = messagesEl && isNearBottom(messagesEl);

  const updateProgressText = (pct) => {
    if(!host.isConnected) return; // сообщение перерисовано/удалено
    const loadingSpan = host.querySelector('.media-loading');
    if(loadingSpan) loadingSpan.textContent = GLYPH_LOADING + ' ' + loadingPercentText(pct);
  };
  const entry = await decryptInto(host, aesgcmUrl, updateProgressText, senderJid);
  if(!entry) return; // сообщение перерисовано/удалено
  const isMediaOnly = host.classList.contains('media-frame');
  // data-kind/data-download-* нужны свайпу (message-swipe/wire.js): копировать текст или скачивать файл. Только для isMediaOnly; для вложения среди текста свайп копирует текст.
  const bubble = isMediaOnly ? host.closest('.bubble') : null;

  renderDecrypted(host, entry, { aesgcmUrl, isMediaOnly, bubble });
  if(wasNearBottom) rescrollToBottom(messagesEl);
}

// Настройка «Не загружать видео автоматически» (features/profile/): для видео/аудио/файла вешаем клик вместо немедленной расшифровки. Уже скачанное (IndexedDB) deferUntilTap грузит сразу.
export function loadDeferredMedia(host, aesgcmUrl, holdOff, senderJid){
  deferUntilTap(host, {
    holdOff,
    cachedUrl: aesgcmUrl,
    onTap: () => setHTML(host, loadingHtml(null, loadingPercentText(0))),
    start: () => loadEncryptedMedia(host, aesgcmUrl, senderJid),
  });
}
