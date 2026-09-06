// ===================== features/image-settings.js =====================
// Настройка автозагрузки ОБЫЧНЫХ https-картинок из текста сообщения
// (не aesgcm:// - те уже требуют явного OMEMO-контекста и сюда не относятся).
// Механика скопирована с features/video-settings.js, но дефолт -
// ПРОТИВОПОЛОЖНЫЙ: голая https-ссылка на картинку в чужом сообщении - это
// classic tracking pixel (раскрывает IP/UA/точное время прочтения при
// автозагрузке), поэтому по умолчанию НЕ грузим автоматически.
// См. security-plan.md, п.5, "Вариант Б".
//
// Чекбокс - в модалке профиля, рядом с video-no-autoload-toggle (см.
// index.html, features/profile.js).
//
// Ещё не сделано (см. riedchat-p5-remaining.md, п.3): исключение для
// доверенных/давних контактов - по плану автозагрузка не должна включаться
// для непроверенных/новых контактов, даже если общий тумблер включён.
// Сейчас проверяется только этот глобальный флаг.
import { accountKey, lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

export function loadImageAutoDownloadEnabled(){
  return lsGet(accountKey('xmppImageAutoDownload'), false); // по умолчанию ВЫКЛЮЧЕНО
}
export function saveImageAutoDownloadEnabled(enabled){
  lsSet(accountKey('xmppImageAutoDownload'), !!enabled);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('image-no-autoload-toggle').checked = !loadImageAutoDownloadEnabled();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveImageAutoDownloadEnabled(!$('image-no-autoload-toggle').checked);
}
