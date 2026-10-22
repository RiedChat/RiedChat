// ===================== ui/chat-view/message-body-html.js =====================
// Чистая логика (без DOM и сети): какое медиа в сообщении и разбор тела в HTML - цитата (outgoing.js:buildQuotedBody), инлайн-медиа/ссылки.
// Строит разметку с плейсхолдерами (data-media-*); догрузку делает render-messages.js после вставки в DOM.
import { cx, escapeHtml, html, raw } from '../../core/safe-html.js';
import { IMG_RE, URL_RE, splitQuotedBody } from '../../core/text-patterns.js';
import { canAutoLoadImage } from '../../features/autoload-settings.js';
import { mediaLabel } from '../../features/message-swipe/shared.js';
import { classifyUrl } from '../../net/media/classify.js';
import { isAesgcm, AESGCM_RE } from '../../net/media/mime-kind.js';

import { TAP_LOAD_CLASS, BLANK_LINK_ATTRS, imageLinkHtml, mediaAttrs, quoteTapLoadThumb, photoTapBox, deferredFrameHtml } from './media-placeholder.js';
import { describeMedia } from './media-traits.js';

// Тело целиком - одна ссылка на фото/видео/аудио (без текста): фото/видео рендерятся «встык» (.bubble.media-only), голосовые/аудио - компактным пузырём (.bubble.voice-only).
export function classifySingleMedia(raw){
  const single = classifyUrl(raw);
  // Незашифрованная ссылка - вложение только если картинка или пак стикеров; остальное - обычный текст.
  return single && (single.encrypted || single.kind !== 'file') ? single : null;
}

// Метка вложения («📷 Фото» и т.п.) или null, если тело - не одиночное медиа. Для цитаты (formatMessageBody) и превью ростера (ui/roster.js). single - готовый classifySingleMedia(body), если есть.
export function mediaLabelFor(body, single = classifySingleMedia(body)){
  return single ? mediaLabel(single.kind, body) : null;
}

// Миниатюра в цитате - только для фото/видео (включая кружки и стикеры, см. message-swipe/shared.js:mediaLabel); голосовым/файлам/пакам хватает метки.
// Возвращает thumbHtml ('' - миниатюры нет); догрузку описывают data-media-* на контейнере (quote-thumb.js, картинка за тапом - plain-image).
function quoteThumb(quotedMedia, out){
  if(!quotedMedia || (quotedMedia.kind !== 'image' && quotedMedia.kind !== 'video')) return '';
  const { kind, url } = quotedMedia;
  const desc = describeMedia(url, { out, kind });
  const { isNote } = desc;
  const thumbClass = 'quote-thumb' + (isNote ? ' quote-thumb-round' : '');
  if(quotedMedia.encrypted){
    // aesgcm://: плейсхолдер, расшифровка после вставки в DOM (media.decrypt). Автозагрузка как у инлайн-медиа (shouldHoldOff в describeMedia), иначе цитата качала бы вложение в обход настройки.
    // Картинки (кроме стикеров) shouldHoldOff не задерживает - для них canAutoLoadImage, цитата его тоже соблюдает. При holdOff расшифровка - по тапу (quote-thumb.js:loadQuoteThumbOrDefer).
    const holdOff = desc.holdOff || (kind === 'image' && !canAutoLoadImage(out));
    const attrs = mediaAttrs('quote-thumb', url, holdOff);
    return holdOff ? quoteTapLoadThumb(thumbClass, attrs) : html`<div class="${thumbClass}"${attrs}></div>`;
  }
  if(kind !== 'image') return '';
  // Открытый https-URL: тот же tracking-pixel риск (security-plan.md, п.5), решение то же - canAutoLoadImage (out || автозагрузка + доверенный контакт).
  return canAutoLoadImage(out)
    ? html`<div class="${thumbClass}"><img src="${url}" loading="lazy"></div>`
    : quoteTapLoadThumb(thumbClass, mediaAttrs('plain-image', url));
}

// Блок цитаты. data-quote-text - для клика (features/quote-jump.js): по нему ищем исходное сообщение (id в теле не передаётся).
// Для медиа quoted - голая ссылка (message-swipe/quote.js:startReply): показываем метку, в data-quote-text оставляем ссылку.
function buildQuote(quoteSplit, out){
  const { quoted, author, id } = quoteSplit;
  const quotedMedia = classifySingleMedia(quoted);
  const displayText = mediaLabelFor(quoted, quotedMedia) ?? quoted;
  const idAttr = id === null ? '' : html` data-quote-id="${id}"`;
  const thumbHtml = quoteThumb(quotedMedia, out);
  const authorHtml = author ? html`<span class="quote-author">${author}</span>` : '';
  // html`` экранирует подстановки; formatMessageBody отдаёт обычную строку.
  const quoteHtml = String(html`<div class="quote-block" data-quote-author="${author}" data-quote-text="${quoted}"${idAttr}>${thumbHtml}<div class="quote-block-text">${authorHtml}${displayText}</div></div>`);
  return quoteHtml;
}

// aesgcm:// сначала скачивается и расшифровывается: ставим плейсхолдер с data-media-*, заполняем асинхронно через media.decrypt().
// u уже заэкранирован (bodyHtml прошёл escapeHtml) - в атрибут идёт как raw(u); браузер раскодирует сущности, dataset.mediaUrl отдаст исходную ссылку.
function inlineMediaHtml(u, { out }){
  // audio-embed ставим сразу (kind известен по расширению): плеер ужимается классом, без :has() (не везде в Android WebView).
  // Кружок - video-kind, но круглый плеер 200x200 вместо 16:9 (bubble-renderers.js:renderMediaBubble).
  // Файл (.pdf/.docx/.zip) вместе с текстом/цитатой (иначе singleMedia) - та же проверка настройки, что у видео (решение - describeMedia).
  const desc = describeMedia(u, { out });
  const { kind, isNote, holdOff } = desc;
  const extraClass = kind === 'audio' ? 'audio-embed' : isNote ? 'video-note-embed' : '';
  // Превью из ссылки (thumb-codec.js) - desc.thumbDataUrl, фоном плейсхолдера до скачивания (при holdOff - до тапа). Плашка - <span>: bodyHtml режется regex по первому </div> media-embed.
  const inner = deferredFrameHtml(desc);
  return `<div class="${cx('media-embed', extraClass, holdOff && TAP_LOAD_CLASS)}"${mediaAttrs('deferrable', raw(u), holdOff)}>${inner}</div>`;
}

// Обычные ссылки: картинка - <img> или заглушка до тапа, остальное - <a>. u уже заэкранирован (bodyHtml прошёл escapeHtml).
function inlineUrlHtml(u, { out }){
  if(isAesgcm(u)) return u; // уже обработано в inlineMediaHtml
  if(!IMG_RE.test(u)) return String(html`<a href="${raw(u)}" ${BLANK_LINK_ATTRS}>${raw(u)}</a>`);
  // Свои ссылки (out) - сразу. Входящие - только при включённой автозагрузке и доверенном контакте (net/trusted-contacts.js): иначе голая ссылка - tracking pixel (security-plan.md, п.5).
  // Иначе - заглушка с рамкой 16:9; по тапу loadPlainImage подменяет её на <img>.
  return String(canAutoLoadImage(out)
    ? imageLinkHtml(raw(u))
    : html`<div class="media-embed ${TAP_LOAD_CLASS}"${mediaAttrs('plain-image', raw(u))}>${photoTapBox()}</div>`);
}

// .bubble с white-space:pre-wrap: пустые строки вокруг вложения раздували бы высоту. Блочные вставки медиа сами переносят строку - убираем переносы вокруг них.
const EMBED_NEWLINES_RE = /(\n[ \t]*)*(<div class="media-embed[^"]*"[^>]*>[\s\S]*?<\/div>)([ \t]*\n)*/g;

// Разбор тела обычного (не single-media) сообщения: выделяет цитату, заменяет aesgcm://-медиа и ссылки на плейсхолдеры.
// Возвращает {quoteHtml, bodyHtml}. Что догрузить после вставки в DOM, описывают data-media-* на плейсхолдерах (media-placeholder.js:mediaAttrs).
export function formatMessageBody(rawBody, { out }){
  let mainBody = rawBody || '';
  let quoteHtml = '';
  const ctx = { out };

  const quoteSplit = splitQuotedBody(mainBody);
  if(quoteSplit){
    quoteHtml = buildQuote(quoteSplit, out);
    mainBody = quoteSplit.rest;
  }

  const bodyHtml = escapeHtml(mainBody.trim())
    .replace(AESGCM_RE, u => inlineMediaHtml(u, ctx))
    .replace(URL_RE, u => inlineUrlHtml(u, ctx))
    .replace(EMBED_NEWLINES_RE, '$2');
  return { quoteHtml, bodyHtml };
}
