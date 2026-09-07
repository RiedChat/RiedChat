// ===================== features/file-settings.js =====================
// Настройка автозагрузки ОБЫЧНЫХ файлов-вложений (kind 'file' из
// net/media/mime-kind.js: .pdf/.docx/.zip и т.п. - всё, что не попало в
// image/video/audio/sticker). По образцу features/image-settings.js:
// дефолт ВЫКЛЮЧЕНО - произвольный файл от кого угодно (в т.ч. непроверенного
// контакта) не должен тихо скачиваться и расшифровываться сам по себе, ни
// инлайн в теле сообщения, ни как отдельное media-only вложение.
// Чекбокс - в модалке профиля, рядом с audio-no-autoload-toggle (см.
// index.html, features/profile/modal.js).
import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

export function loadFileAutoDownloadEnabled(){
  return lsGet(accountKey('xmppFileAutoDownload'), false); // по умолчанию ВЫКЛЮЧЕНО
}
export function saveFileAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppFileAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('file-no-autoload-toggle').checked = !loadFileAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveFileAutoDownloadEnabled(!$('file-no-autoload-toggle').checked);
}
