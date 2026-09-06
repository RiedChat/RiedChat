// ===================== net/media/thumb-codec.js =====================
// Кодирование/декодирование маленького превью-кадра, встроенного прямо в
// aesgcm://-ссылку вложения (см. net/upload.js). Тот же принцип, что и в
// XEP-0264 (Jingle Content Thumbnails) - да и в самом XMPP это давно
// устоявшаяся идея: превью генерируется ОДИН РАЗ на стороне отправителя,
// из ещё не зашифрованного/не загруженного оригинала, и путешествует
// вместе с сообщением (внутри того же, что и сама ссылка, тела сообщения,
// т.е. под тем же OMEMO-шифрованием) - а не выковыривается заново при
// каждом рендере из уже скачанного/расшифрованного файла.
//
// Формат ссылки: aesgcm://host/path#<hex(iv+key)>;t=<base64url(jpeg)>
// ';t=' - невалидные hex-символы, поэтому разбор ключа
// (net/media-worker/fetch-decrypt.js) однозначно останавливается на них,
// не задевая существующий формат ссылок без превью (старые сообщения,
// другие XMPP-клиенты).
const THUMB_SEP = ';t=';
const DEFAULT_MAX_DIM = 320;
const JPEG_QUALITY = 0.6;
// Только этот алфавит - строго проверяем при разборе (см. splitAesgcmFragment),
// чтобы то, что в итоге может попасть в HTML (background-image в стиле,
// см. ui/chat-view/message-body-html.js), не могло содержать кавычки/скобки,
// даже если сама aesgcm-ссылка пришла от недоверенного отправителя.
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function toBase64Url(base64){
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64url){
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while(b64.length % 4) b64 += '=';
  return b64;
}

// Рисует source (любой CanvasImageSource с videoWidth/videoHeight ИЛИ
// width/height - подходит и <video>, и <canvas>) в ограниченный по
// размеру временный canvas и возвращает JPEG как base64url-строку без
// паддинга, либо null, если у источника ещё нет реальных размеров кадра.
export function encodeThumbFromSource(source, maxDim){
  const w = source.videoWidth || source.width || 0;
  const h = source.videoHeight || source.height || 0;
  if(!w || !h) return null;
  const limit = maxDim || DEFAULT_MAX_DIM;
  const scale = Math.min(1, limit / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1];
  return base64 ? toBase64Url(base64) : null;
}

// Дописывает превью к уже готовой aesgcm://host/path#hexKeyIv ссылке.
export function appendThumbToLink(aesgcmLink, thumbB64url){
  if(!thumbB64url) return aesgcmLink;
  return aesgcmLink + THUMB_SEP + thumbB64url;
}

// Разбирает содержимое ссылки ПОСЛЕ '#' на {keyHex, thumbB64url}.
// thumbB64url === null, если превью не встроено или встроенная часть
// оказалась не похожа на base64url (защита от мусора/подмены).
export function splitAesgcmFragment(fragment){
  const idx = fragment.indexOf(THUMB_SEP);
  if(idx === -1) return { keyHex: fragment, thumbB64url: null };
  const keyHex = fragment.slice(0, idx);
  const rawThumb = fragment.slice(idx + THUMB_SEP.length);
  return { keyHex, thumbB64url: BASE64URL_RE.test(rawThumb) ? rawThumb : null };
}

// data:-URI, готовый для videoEl.poster / <img src> / CSS background-image.
export function thumbToDataUrl(thumbB64url){
  return 'data:image/jpeg;base64,' + fromBase64Url(thumbB64url);
}

// Достаёт превью прямо из aesgcm-ссылки сообщения, без похода в сеть и без
// расшифровки самого вложения - используется, чтобы показать кадр СРАЗУ
// (см. ui/chat-view/media-loader.js), в т.ч. ещё до того, как пользователь
// вообще нажал "загрузить". Возвращает null, если у ссылки нет встроенного
// превью (сообщение отправлено до этой функции или другим клиентом).
export function extractThumbDataUrl(aesgcmUrl){
  const hashIdx = String(aesgcmUrl || '').indexOf('#');
  if(hashIdx === -1) return null;
  const { thumbB64url } = splitAesgcmFragment(aesgcmUrl.slice(hashIdx + 1));
  return thumbB64url ? thumbToDataUrl(thumbB64url) : null;
}
