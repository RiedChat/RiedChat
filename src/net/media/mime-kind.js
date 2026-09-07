// ===================== net/media/mime-kind.js =====================
// Чистые функции определения типа медиа по MIME или расширению файла.
// Выделено из net/media.js - не зависят ни от кэша, ни от воркера,
// поэтому тестируются и переиспользуются независимо (см. net/upload.js).

export function kindOfMime(mime){
  if(!mime) return null;
  if(mime.startsWith('image/')) return 'image';
  if(mime.startsWith('video/')) return 'video';
  if(mime.startsWith('audio/')) return 'audio';
  return null;
}

export function extOf(url){
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

// Настоящее имя файла из ссылки (для превью/скачивания generic-файлов -
// .apk/.zip/.pdf и т.п., см. ui/chat-view/bubble-renderers.js и
// ui/chat-view/media-loader.js). Работает и для aesgcm://, и для обычных
// https:// ссылок - хвост после # (ключ/превью) и query-параметры уже
// отрезаны до вызова decodeURIComponent, чтобы percent-encoding из самого
// имени файла не ломался на невалидной последовательности.
export function fileNameOf(url){
  const clean = String(url || '').split('#')[0].split('?')[0];
  const last = clean.split('/').pop() || '';
  try{ return decodeURIComponent(last); }catch(e){ return last; }
}

export function kindOf(ext){
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
  if(['mp4','webm','mov','ogv'].includes(ext)) return 'video';
  if(['mp3','oga','ogg','wav','m4a','opus','weba'].includes(ext)) return 'audio';
  return 'file';
}

// Круглые видео-сообщения ("кружки", features/video-note.js) уходят как
// обычное video/webm-вложение (тот же пайплайн загрузки/расшифровки, что и
// у любого видео), поэтому единственный маркер, что их нужно рисовать
// круглыми, а не в стандартной 16:9-рамке, - префикс "videonote-" в имени
// файла, который сохраняется в URL сервером загрузки (XEP-0363).
export function isVideoNote(url){
  const clean = String(url || '').split('?')[0].split('#')[0];
  const name = clean.split('/').pop() || '';
  return /^videonote-/i.test(name);
}

// Стикеры (features/stickers/*) - тоже обычное image-вложение, тот же
// принцип различения по префиксу в имени файла, что и у кружков выше
// (см. features/stickers/panel-state.js:sendStickerById).
export function isSticker(url){
  const clean = String(url || '').split('?')[0].split('#')[0];
  const name = clean.split('/').pop() || '';
  return /^sticker-/i.test(name);
}

// Пак стикеров целиком (features/stickers/share.js:buildStickerPackFile) -
// zip-архив со всеми стикерами пака, отправляется как обычное вложение.
// Маркер - фиксированное имя файла "stickers.zip" (тот же принцип, что и у
// isSticker/isVideoNote выше, только по имени целиком, а не по префиксу -
// само содержимое архива не привязано к конкретному имени пака, поэтому
// имя файла не может его нести). См. features/stickers/pack-card.js -
// именно по этому маркеру входящий zip разворачивается в карточку
// "Добавить пак" вместо обычной ссылки на файл.
export function isStickerPack(url){
  const clean = String(url || '').split('?')[0].split('#')[0];
  const name = clean.split('/').pop() || '';
  return /^stickers\.zip$/i.test(name);
}
