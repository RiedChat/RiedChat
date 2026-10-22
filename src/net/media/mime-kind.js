// ===================== net/media/mime-kind.js =====================
// Чистые функции определения типа медиа по MIME/расширению (без кэша и воркера; см. net/upload.js).
import { extOf as extOfName } from '../../core/text-patterns.js';
import * as bytes from '../../crypto/bytes.js';

export const MIME_BY_EXT = {
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp',
  mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', ogv:'video/ogg',
  mp3:'audio/mpeg', oga:'audio/ogg', ogg:'audio/ogg', wav:'audio/wav', m4a:'audio/mp4', opus:'audio/ogg',
  weba:'audio/webm'
};

const kindOfMime = (mime) =>
  ['image', 'video', 'audio'].find(k => mime?.startsWith(k + '/')) ?? null;

// Схема зашифрованного вложения (XEP-0454): aesgcm://...
export const isAesgcm = (url) => /^aesgcm:\/\//i.test(url);

const stripUrl = (url) => String(url || '').split('?')[0].split('#')[0];
const baseName = (url) => stripUrl(url).split('/').pop() || '';

export const extOf = (url) => extOfName(stripUrl(url));

// Кодирует имя файла в хвост ';n=<base64url>' (обратная операция - fileNameOf).
export const fileNameFragment = (name) =>
  'n=' + bytes.toBase64Url(bytes.b64FromBuf(bytes.utf8ToBuf(name)));

// Разбор содержимого ссылки ПОСЛЕ '#':
//   <hex(iv+key)>[;t=<base64url(jpeg)>][;n=<base64url(utf8 имени)>]
// Хвосты - в любом порядке; у обычных https-ссылок ключа может не быть (фрагмент начинается с 'n=').
// Возвращает {keyHex, thumb, name}: thumb - base64url-превью или null (нет/не base64url -
// защита от мусора, см. thumb-codec.js); name - имя файла или null.
export function parseAesgcmFragment(fragment){
  const parts = String(fragment || '').split(';');
  const keyHex = /^[tn]=/.test(parts[0]) ? '' : parts.shift();
  let thumb = null;
  let name = null;
  for(const part of parts){
    const m = /^([tn])=([A-Za-z0-9_-]+)$/.exec(part);
    if(!m) continue;
    if(m[1] === 't'){
      thumb ??= m[2];
    }else if(name === null){
      try{ name = bytes.bufToUtf8(bytes.bufFromB64(bytes.fromBase64Url(m[2]))); }catch{}
    }
  }
  return { keyHex, thumb, name };
}

// Имя файла из ссылки (для превью/скачивания generic-файлов; см. ui/chat-view/bubble-renderers.js,
// ui/chat-view/media-loader/encrypted-media.js). Для aesgcm:// и https://: хвост после # и query
// отрезаются до decodeURIComponent, чтобы percent-encoding не ломался.
export function fileNameOf(url){
  const str = String(url || '');
  const hashIdx = str.indexOf('#');
  if(hashIdx !== -1){
    const { name } = parseAesgcmFragment(str.slice(hashIdx + 1));
    if(name) return name;
  }
  const last = baseName(str);
  try{ return decodeURIComponent(last); }catch{ return last; }
}

export const kindOf = (ext) => kindOfMime(MIME_BY_EXT[ext]) || 'file';

// Вид вложения по File/Blob: MIME, затем расширение. Возвращает 'image' | 'video' | 'audio' | 'file'.
export const kindOfFile = (file) => kindOfMime(file.type) || kindOf(extOf(file.name || ''));

// Кружки (features/video-note.js) уходят как обычное video/webm; маркер "рисовать круглым" -
// префикс "videonote-" в имени файла (сохраняется в URL сервером, XEP-0363).
const nameMatches = (re) => (url) => re.test(baseName(url));
export const isVideoNote = nameMatches(/^videonote-/i);

// Стикеры (features/stickers/*) - обычное image-вложение, маркер - префикс в имени файла
// (features/stickers/panel-state.js:sendStickerById).
export const isSticker = nameMatches(/^sticker-/i);

// Пак стикеров (features/stickers/share.js:buildStickerPackFile) - JSON со всеми стикерами.
// Маркер - имя файла "stickers.json" целиком (содержимое от имени пака не зависит).
// По нему features/stickers/pack-card.js показывает карточку "Добавить пак".
export const isStickerPack = nameMatches(/^stickers\.json$/i);

// "Особый" вид вложения: кружок и стикер отличаются только префиксом имени (isVideoNote/isSticker).
// Возвращает 'videonote' | 'sticker' | kind. Используется в features/message-search,
// features/message-swipe/shared.js:mediaLabel, features/autoload-settings.js:shouldHoldOff.
export function categoryOf(kind, url){
  if(kind === 'video' && isVideoNote(url)) return 'videonote';
  if(kind === 'image' && isSticker(url)) return 'sticker';
  return kind;
}

// Зашифрованные вложения (XEP-0454): aesgcm://host/path#<hex(iv+key)> + необязательные хвосты ';t=<base64url>' (превью), ';n=<base64url>' (имя).
export const AESGCM_RE = /aesgcm:\/\/[^\s#]+#[0-9a-fA-F]+(?:;(?:t|n)=[A-Za-z0-9_-]+)*/g;
