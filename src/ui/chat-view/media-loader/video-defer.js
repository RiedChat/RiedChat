// ============= ui/chat-view/media-loader/video-defer.js =============
import { html, setHTML } from '../../../core/safe-html.js';
import { t } from '../../../i18n/t.js';
import { history } from '../../../net/history.js';

import { loadEncryptedMedia } from './encrypted-media.js';

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
  if(history && history.hasMediaEntry){
    history.hasMediaEntry(aesgcmUrl).then(has => { if(has) startLoad(); }).catch(() => {});
  }
}
