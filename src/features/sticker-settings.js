// ===================== features/sticker-settings.js =====================
// Настройка автозагрузки входящих стикеров (features/stickers/*) на аккаунт
// (localStorage) - стикеры технически такое же зашифрованное image-вложение,
// как обычная картинка (см. net/media/mime-kind.js:isSticker), но приходят
// пачками и от кого угодно, поэтому вынесены в отдельный тумблер, а не
// завязаны на общую настройку картинок (features/image-settings.js).
// Механика - точная копия video-settings.js. UI - чекбокс в модалке профиля.
import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

export function loadStickerAutoDownloadEnabled(){
  return lsGet(accountKey('xmppStickerAutoDownload'), true); // по умолчанию включено
}
export function saveStickerAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppStickerAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('sticker-no-autoload-toggle').checked = !loadStickerAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveStickerAutoDownloadEnabled(!$('sticker-no-autoload-toggle').checked);
}
