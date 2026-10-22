// ===================== ui/chat-view/media-placeholder.js =====================
// Разметка плашки «нажмите, чтобы загрузить» для медиа-плейсхолдеров (бокс 16:9 или круглый для кружка, превью-фон, иконка).
import { icon } from '../../core/icons.js';
import { cx, html, raw } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';

// Атрибуты плейсхолдера догрузки: после вставки в DOM render-messages.js находит [data-media-type] и передаёт загрузчику сам элемент - id и глобальный счётчик не нужны.
// type: deferrable | plain-image | stickerpack | quote-thumb. url экранирует html``; уже заэкранированный url (message-body-html.js) передавать как raw(url).
export const mediaAttrs = (type, url, holdOff = false) =>
  html` data-media-type="${type}" data-media-url="${url}" data-hold="${String(!!holdOff)}"`;

// Класс «ждёт тапа»: CSS даёт cursor:pointer, deferUntilTap/loadPlainImage снимают его после клика.
export const TAP_LOAD_CLASS = 'video-tap-load';

const ICON_PHOTO = icon('photo');

// Атрибуты внешней ссылки (открытие в новой вкладке без доступа к window.opener). raw: внутри html`` не экранируется, в обычных шаблонных строках подставляется через toString.
export const BLANK_LINK_ATTRS = raw('target="_blank" rel="noopener"');

export const GLYPH_PLAY = '▶';
export const GLYPH_LOADING = '⏳';

export const loadingPercentText = percent => t('media.loadingPercent', { percent });

export const videoBoxClass = isNote => isNote ? 'video-note-box' : 'video-ratio-box';

// dataUrl из extractThumbDataUrl уже проверен на base64url-алфавит - дополнительное экранирование не нужно.
const thumbStyleAttr = dataUrl => dataUrl
  ? ` style="background-image:url('${dataUrl}');background-size:cover;background-position:center"`
  : '';

// Плашка «нажмите, чтобы загрузить»: круглая кнопка поверх рамки (css/media-messages.css).
// Везде <span>: вложенный <div> в .media-embed обрезал бы разметку по regex в message-body-html.js.
// iconHtml - безопасная разметка иконки; svg=true для SVG (не глифа ▶) - влияет на класс кнопки. caption - безопасная подпись (html`` или '').
const tapLoadOverlay = ({ iconHtml, svg = true, caption = '' }) =>
  html`<span class="video-tap-load-overlay"><span class="${cx('video-tap-load-play', svg && 'video-tap-load-play-svg')}">${raw(iconHtml)}</span>${caption}</span>`;

// Иконка плашки: стикер - фото, файл - скрепка, остальное - ▶. Возвращает {iconHtml, svg} для tapLoadBox.
const tapIconFor = (kind, isSticker = false) =>
  isSticker ? { iconHtml: ICON_PHOTO, svg: true }
    : kind === 'file' ? { iconHtml: icon('paper-clip'), svg: true }
      : { iconHtml: GLYPH_PLAY, svg: false };

// Контейнер миниатюры в цитате с плашкой «нажмите, чтобы загрузить». attrs - mediaAttrs(...).
export const quoteTapLoadThumb = (thumbClass, attrs) =>
  html`<div class="${thumbClass} ${TAP_LOAD_CLASS}"${attrs}>${tapLoadOverlay({ iconHtml: ICON_PHOTO })}</div>`;

// tag по умолчанию 'span': message-body-html.js ищет конец media-embed по первому </div>. iconHtml/caption - безопасная разметка. Результат html`` годится для подстановки в строку (String()).
function tapLoadBox({ tag = 'span', isNote = false, iconHtml, svg = true, caption = '', thumbDataUrl = null }){
  return html`<${tag} class="${videoBoxClass(isNote)}"${raw(thumbStyleAttr(thumbDataUrl))}>${tapLoadOverlay({ iconHtml, svg, caption })}</${tag}>`;
}

// Плашка «фото за тапом» (фото/стикер без автозагрузки).
export const photoTapBox = () => tapLoadBox({ iconHtml: ICON_PHOTO });

// <a><img></a> со ссылкой на картинку; url экранируется html`` даже в атрибуте. Уже экранированный url (message-body-html.js:inlineUrlHtml) передавать как raw(url), иначе будет двойное экранирование.
export const imageLinkHtml = url => html`<a href="${url}" ${BLANK_LINK_ATTRS}><img src="${url}"></a>`;

// Строка «глиф текст» внутри рамки медиа (опционально с превью-фоном): спиннер загрузки и метка «нажмите» у голосовых.
export const mediaLoadingSpan = (glyph, text, thumbDataUrl = null) =>
  html`<span class="media-loading"${raw(thumbStyleAttr(thumbDataUrl))}>${glyph} ${text}</span>`;

// Спиннер «⏳ текст» (опционально с превью-фоном).
export const loadingHtml = (thumbDataUrl = null, text = t('media.loading')) =>
  mediaLoadingSpan(GLYPH_LOADING, text, thumbDataUrl);

// Содержимое незагруженной рамки: плашка (holdOff) или спиннер. Общее для медиа-пузыря и инлайн-медиа. tag: 'span' для инлайна (внутри .media-embed нельзя <div>), 'div' для рамки пузыря; caption - подпись плашки (имя файла).
export function deferredFrameHtml({ holdOff, kind, isNote = false, isSticker = false, thumbDataUrl = null, caption = '', tag = 'span' }){
  if(!holdOff) return loadingHtml(thumbDataUrl);
  return tapLoadBox({ tag, isNote, ...tapIconFor(kind, isSticker), caption, thumbDataUrl });
}
