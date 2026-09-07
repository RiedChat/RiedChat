// ===================== features/audio-settings.js =====================
// Настройки голосовых/аудио на аккаунт (localStorage): автозагрузка входящих.
// UI - чекбокс в модалке профиля. По образцу features/video-settings.js.

import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

// ---------------- АВТОЗАГРУЗКА ГОЛОСОВЫХ (localStorage, на аккаунт) ----------------
// По умолчанию входящие голосовые/аудио скачиваются и расшифровываются сразу
// же. Если пользователь включит "Не загружать голосовые автоматически",
// ui/chat-view/bubble-renderers.js вместо этого покажет только плашку "нажмите,
// чтобы загрузить" и запустит скачивание (media.decrypt - оно же кладёт файл
// в постоянный кэш) только по тапу.
export function loadAudioAutoDownloadEnabled(){
  return lsGet(accountKey('xmppAudioAutoDownload'), true); // по умолчанию включено
}
export function saveAudioAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppAudioAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('audio-no-autoload-toggle').checked = !loadAudioAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveAudioAutoDownloadEnabled(!$('audio-no-autoload-toggle').checked);
}
