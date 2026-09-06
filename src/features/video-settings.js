// ===================== features/video-settings.js =====================
// Настройки видео на аккаунт (localStorage): автозагрузка входящих. UI -
// чекбокс в модалке профиля.
import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

// ---------------- АВТОЗАГРУЗКА ВИДЕО (localStorage, на аккаунт) ----------------
// По умолчанию входящие видео скачиваются и расшифровываются сразу же (как и
// раньше). Если пользователь включит "Не загружать видео автоматически",
// ui/chat-view/render-messages.js вместо этого покажет только превью-плашку "нажмите, чтобы
// загрузить видео" и запустит скачивание (App.media.decrypt - оно же и кладёт
// файл в постоянный кэш) только по тапу.
export function loadVideoAutoDownloadEnabled(){
  return lsGet(accountKey('xmppVideoAutoDownload'), true); // по умолчанию включено
}
export function saveVideoAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppVideoAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('video-no-autoload-toggle').checked = !loadVideoAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveVideoAutoDownloadEnabled(!$('video-no-autoload-toggle').checked);
}
