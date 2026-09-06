// ===================== ui/chat-view/media-loader.js =====================
// Скачивание/расшифровка медиа-вложений сообщений и подмена плейсхолдеров
// на реальный контент. Выделено из ui/chat-view.js.
import { html, setHTML } from '../../core/safe-html.js';
import { $ } from '../../core/dom-utils.js';
import { history } from '../../net/history.js';
import { media } from '../../net/media.js';
import { setPreviewPoster } from './video-poster.js';
import { mountVoicePlayer } from '../voice-player/mount.js';
import { t } from '../../i18n/t.js';

// Настройка "Не загружать видео автоматически" (см. features/profile.js):
// если она включена и это видео, вместо немедленной расшифровки вешаем на
// плейсхолдер обработчик клика - реальное скачивание (и запись в постоянный
// кэш, см. media.decrypt) запускается только по тапу пользователя.
// Для картинок/аудио/уже скачанных своих же файлов поведение не меняется.
export function _loadMediaOrDeferForVideo(placeholderId, aesgcmUrl, holdOff, senderJid){
  if(!holdOff){
    loadEncryptedMedia(placeholderId, aesgcmUrl, senderJid);
    return;
  }
  const host = document.getElementById(placeholderId);
  if(!host){ loadEncryptedMedia(placeholderId, aesgcmUrl, senderJid); return; }
  let started = false;
  const startLoad = () => {
    if(started) return;
    started = true;
    host.classList.remove('video-tap-load');
    setHTML(host, html`<span class="media-loading">⏳ ${t('media.loadingPercent', {percent: 0})}</span>`);
    loadEncryptedMedia(placeholderId, aesgcmUrl, senderJid);
  };
  host.addEventListener('click', startLoad, {once: true});
  // Этот файл уже мог быть скачан и расшифрован раньше - самим же получателем
  // в прошлой сессии (до перезагрузки страницы, когда обнулился только кэш в
  // памяти вкладки, media.getCached) - и лежит в постоянном кэше
  // (IndexedDB). Проверяем это в фоне и, если файл уже на устройстве, сразу
  // загружаем его без повторного нажатия - плашка "нажмите, чтобы загрузить"
  // нужна только для того, что реально ещё не скачано.
  if(history && history.getMediaEntry){
    history.getMediaEntry(aesgcmUrl).then(rec => { if(rec) startLoad(); }).catch(() => {});
  }
}

// Обычная https-картинка (не aesgcm://) с включённой заглушкой "нажмите,
// чтобы загрузить" (см. features/image-settings.js). Расшифровывать нечего -
// по клику просто подменяем плейсхолдер на реальный <img>. В отличие от
// _loadMediaOrDeferForVideo, тут нет ни media.decrypt(), ни постоянного кэша:
// картинка и так лежит открытым текстом на исходном хосте, повторная
// загрузка каждый раз - ожидаемое поведение (иначе пришлось бы держать
// собственный кэш только ради экономии одного повторного GET).
export function loadPlainImage(placeholderId, url){
  const host = document.getElementById(placeholderId);
  if(!host) return;
  let started = false;
  const startLoad = () => {
    if(started) return;
    started = true;
    host.classList.remove('image-tap-load', 'video-tap-load');
    setHTML(host, html`<a href="${url}" target="_blank" rel="noopener"><img src="${url}"></a>`);
  };
  host.addEventListener('click', startLoad, {once: true});
}

// Скачивает и расшифровывает файл по aesgcm:// ссылке, затем подменяет
// плейсхолдер на <img>/<video>/<audio> с blob-URL (или ссылку-фолбэк при ошибке).
export async function loadEncryptedMedia(placeholderId, aesgcmUrl, senderJid){
      const messagesEl = $('messages');
      // Запоминаем ДО скачивания/расшифровки: если пользователь был внизу
      // списка в момент, когда появился плейсхолдер "⏳ загрузка медиа…",
      // то после того, как плейсхолдер заменится на реальное фото/видео
      // (обычно куда выше по высоте), нужно снова прижать список к низу -
      // иначе высота пузыря вырастает уже ПОСЛЕ того, как renderMessages()
      // один раз проскроллил вниз, и низ списка визуально "уезжает" вверх
      // относительно видимой области.
      const wasNearBottom = messagesEl &&
        (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) <= 48;

      const updateProgressText = (pct) => {
        const host = document.getElementById(placeholderId);
        if(!host) return; // сообщение уже перерисовано/удалено - обновлять нечего
        const loadingSpan = host.querySelector('.media-loading');
        if(loadingSpan) loadingSpan.textContent = '⏳ ' + t('media.loadingPercent', {percent: pct});
      };
      const entry = await media.decrypt(aesgcmUrl, updateProgressText, senderJid);
      const host = document.getElementById(placeholderId);
      if(!host) return; // сообщение уже перерисовано/удалено
      const isMediaOnly = host.classList.contains('media-frame');
      // data-kind/data-download-* на .bubble нужны свайп-обработчику (features/message-swipe.js),
      // чтобы решить, копировать текст или скачивать файл. Ставим их ТОЛЬКО для
      // "целиком-медиа" сообщений (isMediaOnly) - для картинки/файла, вложенных
      // посреди обычного текста, свайп должен по-прежнему копировать текст сообщения.
      const bubble = isMediaOnly ? host.closest('.bubble') : null;

      // См. комментарий в начале функции: если пользователь был внизу списка
      // ДО подмены плейсхолдера на реальный контент - прижимаем список к низу
      // ещё раз ПОСЛЕ подмены (в двух кадрах - второй нужен фото/видео, чьи
      // реальные intrinsic-размеры браузер применяет к layout не мгновенно).
      const rescrollIfWasAtBottom = () => {
        if(!wasNearBottom || !messagesEl) return;
        requestAnimationFrame(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
          requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
        });
      };

      if(entry.status === 'error'){
        if(isMediaOnly) host.style.padding = '20px 16px'; // такому фолбэку уже нужны свои отступы
        setHTML(host, html`<a href="${aesgcmUrl}" target="_blank" rel="noopener">📎 ${t('media.decryptFailed')}</a>`);
        if(bubble){ bubble.dataset.kind = 'text'; delete bubble.dataset.downloadUrl; delete bubble.dataset.downloadName; }
        rescrollIfWasAtBottom();
        return;
      }
      const {blobUrl, kind} = entry;
      if(bubble){
        bubble.dataset.kind = kind;
        bubble.dataset.downloadUrl = blobUrl;
        const guessedExt = kind === 'image' ? '.jpg' : kind === 'video' ? '.mp4' : kind === 'audio' ? '.mp3' : '';
        const rawName = decodeURIComponent((aesgcmUrl.split('#')[0].split('/').pop() || '').split('?')[0]);
        bubble.dataset.downloadName = rawName || (kind + guessedExt);
      }
      if(kind === 'image'){
        setHTML(host, html`<a href="${blobUrl}" target="_blank" rel="noopener"><img src="${blobUrl}"></a>`);
      } else if(kind === 'video'){
        // Кружок (features/video-note.js) - круглый плеер без рамки 16:9, но
        // с той же кнопкой "на весь экран", что и у обычного видео ниже
        // (.media-expand-btn, см. modals.css/media-viewer.js).
        let isNoteVideo = false;
        if(bubble && bubble.classList.contains('video-note')){
          setHTML(host, html`<div class="video-note-box"><video src="${blobUrl}" controls preload="auto" playsinline loop></video><button type="button" class="media-expand-btn" title="${t('media.openFullscreen')}">⛶</button></div>`);
          isNoteVideo = true;
        } else {
          // Рамка всегда строго 16:9 через классический padding-top hack (а не CSS aspect-ratio,
          // который может не поддерживаться в старых WebView) - видео заполняет её целиком
          // через object-fit:cover, без чёрных/белых полос независимо от реальных пропорций исходника.
          // preload="auto", а не "metadata": видео тут всегда blob-URL уже полностью
          // скачанного и расшифрованного в памяти файла - экономить трафик прогрессивной
          // подгрузкой нечего, а "metadata" во многих браузерах не декодирует вообще
          // никакого кадра, пока не нажат Play (пустой/чёрный прямоугольник до захвата
          // постера, а если сам захват по любой причине не сработает - так и остаётся).
          setHTML(host, html`<div class="video-ratio-box"><video src="${blobUrl}" controls preload="auto" playsinline></video><button type="button" class="media-expand-btn" title="${t('media.openFullscreen')}">⛶</button></div>`);
        }
        const videoEl = host.querySelector('video');
        // skipSeek - см. video-poster.js: кружки идут из MediaRecorder без
        // индекса в контейнере, перемотка на них не работает и раньше
        // молча оставляла постер пустым.
        if(videoEl) setPreviewPoster(videoEl, {skipSeek: isNoteVideo});
      } else if(kind === 'audio'){
        mountVoicePlayer(host, blobUrl);
      } else {
        if(isMediaOnly) host.style.padding = '14px 16px';
        setHTML(host, html`<a href="${blobUrl}" target="_blank" rel="noopener" download>📎 ${t('media.downloadFile')}</a>`);
      }
      rescrollIfWasAtBottom();
}
