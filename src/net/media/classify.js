// ===================== net/media/classify.js =====================
// Разбор "тело сообщения = ровно одна ссылка на вложение". Поверх примитивов mime-kind.js
// (AESGCM_RE/kindOf/extOf/isStickerPack), без кэша/воркера (net/media.js).
import { URL_RE, IMG_RE } from '../../core/text-patterns.js';

import { AESGCM_RE, kindOf, extOf, isStickerPack } from './mime-kind.js';

// Строка целиком - ровно одно совпадение re.
const isOnly = (re, s) => { const m = s.match(re); return m?.length === 1 && m[0] === s; };

// Возвращает {encrypted, kind, url} или null.
//  - aesgcm://: kind - image/video/audio/file или 'stickerpack' (JSON пака, маркер - имя файла, см. isStickerPack);
//  - http(s): 'image' (по расширению), 'stickerpack' или 'file' (любая другая единственная ссылка -
//    считать ли её вложением, решает вызывающий);
//  - остальное (текст, несколько ссылок) - null.
const withPack = (url, kind) => kind === 'file' && isStickerPack(url) ? 'stickerpack' : kind;

export function classifyUrl(body){
  const s = String(body || '').trim();
  if(!s) return null;
  if(isOnly(AESGCM_RE, s)) return { encrypted: true, kind: withPack(s, kindOf(extOf(s))), url: s };
  if(isOnly(URL_RE, s)) return { encrypted: false, kind: withPack(s, IMG_RE.test(s) ? 'image' : 'file'), url: s };
  return null;
}
