// ===================== net/media/thumb-codec.js =====================
// Превью-кадр, встроенный в aesgcm://-ссылку вложения (net/upload.js). Генерируется один раз
// отправителем из незашифрованного оригинала и едет в теле сообщения (под тем же OMEMO).
// Идея как в XEP-0264.
//
// Формат: aesgcm://host/path#<hex(iv+key)>;t=<base64url(jpeg)>
// ';t=' - не hex, поэтому разбор ключа (net/media-worker/fetch-decrypt.js) останавливается на нём;
// ссылки без превью (старые, от других клиентов) не затронуты.
import { makeCanvas } from '../../core/image-utils.js';
import * as bytes from '../../crypto/bytes.js';

import { parseAesgcmFragment } from './mime-kind.js';

const THUMB_SEP = ';t=';
const DEFAULT_MAX_DIM = 320;
const JPEG_QUALITY = 0.6;
// Алфавит base64url строго проверяется при разборе (parseAesgcmFragment в net/media/mime-kind.js):
// значение попадает в HTML (background-image, ui/chat-view/message-body-html.js) и не должно
// содержать кавычки/скобки, даже от недоверенного отправителя.

// Рисует source (CanvasImageSource с videoWidth/videoHeight или width/height) в временный canvas
// ограниченного размера; возвращает JPEG как base64url без паддинга или null, если у источника ещё нет размеров кадра.
export function encodeThumbFromSource(source, maxDim){
  const w = source.videoWidth || source.width || 0;
  const h = source.videoHeight || source.height || 0;
  if(!w || !h) return null;
  const limit = maxDim || DEFAULT_MAX_DIM;
  const scale = Math.min(1, limit / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = makeCanvas(cw, ch);
  canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1];
  return base64 ? bytes.toBase64Url(base64) : null;
}

// Дописывает превью к ссылке aesgcm://host/path#hexKeyIv.
export function appendThumbToLink(aesgcmLink, thumbB64url){
  if(!thumbB64url) return aesgcmLink;
  return aesgcmLink + THUMB_SEP + thumbB64url;
}

// data:-URI для videoEl.poster / <img src> / CSS background-image.
function thumbToDataUrl(thumbB64url){
  return 'data:image/jpeg;base64,' + bytes.fromBase64Url(thumbB64url);
}

// Достаёт превью из aesgcm-ссылки без сети и расшифровки - кадр показывается сразу, в т.ч. до нажатия
// "загрузить" (ui/chat-view/media-loader/). null, если превью нет (отправлено старым/чужим клиентом).
export function extractThumbDataUrl(aesgcmUrl){
  const hashIdx = String(aesgcmUrl || '').indexOf('#');
  if(hashIdx === -1) return null;
  const { thumb } = parseAesgcmFragment(aesgcmUrl.slice(hashIdx + 1));
  return thumb ? thumbToDataUrl(thumb) : null;
}
