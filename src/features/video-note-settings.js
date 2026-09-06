// ===================== features/video-note-settings.js =====================
// Настройка автозагрузки кружков (features/video-note.js) на аккаунт
// (localStorage), отдельно от общей настройки автозагрузки обычного видео
// (features/video-settings.js) - кружки технически такое же video-вложение
// (см. net/media/mime-kind.js:isVideoNote), но пользователь может захотеть
// одно без другого (например, экономить трафик на кружках от малознакомых
// контактов, но не трогать обычные видео). Механика - точная копия
// video-settings.js. UI - чекбокс в модалке профиля.
import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

export function loadVideoNoteAutoDownloadEnabled(){
  return lsGet(accountKey('xmppVideoNoteAutoDownload'), true); // по умолчанию включено
}
export function saveVideoNoteAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppVideoNoteAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('videonote-no-autoload-toggle').checked = !loadVideoNoteAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveVideoNoteAutoDownloadEnabled(!$('videonote-no-autoload-toggle').checked);
}
