// ===================== ui/chat-view/bubble-renderers.js =====================
// Рендереры типов пузыря: чистая генерация HTML, без цикла по списку и DOM списка.
// Рендерер принимает сообщение/singleMedia и {lock, time, ticks}, возвращает {html} для setHTML.
// Что догрузить после вставки в DOM, описывают data-media-* атрибуты на плейсхолдерах (media-placeholder.js:mediaAttrs).
import { ICON_CHECK, icon } from '../../core/icons.js';
import { cx, html, raw } from '../../core/safe-html.js';
import { canAutoLoadImage } from '../../features/autoload-settings.js';
import { t } from '../../i18n/t.js';
import { fileNameOf, extOf } from '../../net/media/mime-kind.js';

import { TAP_LOAD_CLASS, GLYPH_PLAY, deferredFrameHtml, photoTapBox, imageLinkHtml, loadingHtml, mediaAttrs, mediaLoadingSpan } from './media-placeholder.js';
import { describeMedia } from './media-traits.js';
import { formatMessageBody } from './message-body-html.js';

// Галочки только для исходящих: одна - отправлено, две - собеседник прислал <displayed> (XEP-0333). Для входящих пустой html.
export function ticksHtml(m){
  if(!m || !m.out) return raw('');
  const read = m.status === 'read';
  const glyph = read ? ICON_CHECK + ICON_CHECK : ICON_CHECK;
  return html`<span class="${cx('ticks', read && 'read')}" title="${read ? t('message.read') : t('message.sent')}">${raw(glyph)}</span>`;
}

// Рамка голосового/аудио - только текстовая метка. Класс video-tap-load даёт cursor:pointer; круглая play-кнопка рассчитана на оверлей фото/видео и тут не подходит.
function voiceFrameHtml(holdOff){
  return holdOff
    ? mediaLoadingSpan(GLYPH_PLAY, t('media.tapToLoad'))
    : loadingHtml();
}

// Рамка фото/видео/кружка/стикера/файла.
function mediaOnlyFrameHtml(m, { kind, url }, desc){
  // Превью из ссылки (thumb-codec.js) в desc.thumbDataUrl показывается сразу, до загрузки и тапа; только видео/кружки.
  // Имя/расширение файла видны в aesgcm-ссылке до расшифровки: у своих - m.fileName (outgoing/send.js), у чужих - из ссылки.
  let caption = '';
  if(desc.holdOff && kind === 'file'){
    const fileName = m.fileName || fileNameOf(url);
    const fileExt = extOf(fileName).toUpperCase();
    caption = html`<span class="file-tap-load-name">${fileName}${fileExt ? ' · ' + fileExt : ''}</span>`;
  }
  return deferredFrameHtml({ ...desc, tag: 'div', caption });
}

// Время/замок/галочки одним <span> (в текстовом пузыре между lock и time стоит метка «изменено»).
const timeSpan = (cls, { lock, time, ticks }) => html`<span class="${cls}">${lock}${time}${ticks}</span>`;

// Каркас «чистого» медиа-пузыря: рамка + время. attrs - атрибуты пузыря, frameClass - класс рамки (media-frame + маркер «ждёт тапа» или sticker-pack-card), frameAttrs - mediaAttrs(...) рамки ('' - догружать нечего).
function mediaBubbleHtml({ bubbleClass, attrs, frameClass, frameAttrs, frameHtml, timeClass }, ctx){
  return html`<div class="${bubbleClass}"${attrs}>
    <div class="${frameClass}"${frameAttrs}>${frameHtml}</div>
    ${timeSpan(timeClass, ctx)}
  </div>`;
}

// Голосовое/аудио (.voice-only) и чистое медиа (.media-only) - один шаблон. Время оверлеем (.bubble-time.overlay), чтобы не влиять на высоту.
function renderMediaBubble(m, singleMedia, ctx){
  const { kind, url } = singleMedia;
  const isVoice = kind === 'audio';
  // Кружок - круглое video со своим тумблером автозагрузки, стикер - image со своим (картинки по умолчанию не автозагружаются). Выбор - autoload-settings.js:shouldHoldOff.
  // Свои исходящие (m.out) без плашки «нажмите»: файл уже есть (media.primeLocalBlob).
  const desc = describeMedia(url, { out: m.out, kind });
  const { holdOff, isNote } = desc;
  // kind - image/video/audio/file из kindOf.
  return {
    html: mediaBubbleHtml({
      bubbleClass: isVoice ? 'bubble voice-only' : 'bubble media-only' + (isNote ? ' video-note' : ''),
      attrs: html` data-kind="${kind}"`,
      frameClass: cx('media-frame', holdOff && TAP_LOAD_CLASS),
      frameAttrs: mediaAttrs('deferrable', url, holdOff),
      frameHtml: isVoice ? voiceFrameHtml(holdOff) : mediaOnlyFrameHtml(m, singleMedia, desc),
      timeClass: 'bubble-time overlay' + (isVoice ? ' voice-overlay-time' : ''),
    }, ctx),
  };
}

function renderPlainImageBubble(m, { url }, ctx){
  // Незашифрованная картинка: URL готов, data-атрибуты для свайп-скачивания ставим сразу.
  const fileName = fileNameOf(url) || 'image.jpg';
  // Свои - сразу, чужие - при включённой автозагрузке и доверенном контакте (canAutoLoadImage).
  // Плашка - не ссылка: по клику loadPlainImage подменяет её на <img>. url из чужого тела - html`` экранирует его в атрибуте.
  const autoLoad = canAutoLoadImage(m.out);
  const frameHtml = autoLoad ? imageLinkHtml(url) : photoTapBox();
  return {
    html: mediaBubbleHtml({
      bubbleClass: 'bubble media-only',
      attrs: html` data-kind="image" data-download-url="${url}" data-download-name="${fileName}"`,
      frameClass: cx('media-frame', !autoLoad && TAP_LOAD_CLASS),
      frameAttrs: autoLoad ? '' : mediaAttrs('plain-image', url),
      frameHtml,
      timeClass: 'bubble-time overlay',
    }, ctx),
  };
}

// Пак стикеров: здесь только плейсхолдер, карточку рисует features/stickers/pack-card.js после скачивания и разбора архива.
function renderStickerPackBubble({ url }, ctx){
  return {
    html: mediaBubbleHtml({
      bubbleClass: 'bubble sticker-pack-bubble',
      attrs: html` data-kind="stickerpack"`,
      frameClass: 'sticker-pack-card',
      frameAttrs: mediaAttrs('stickerpack', url),
      frameHtml: loadingHtml(null, t('stickers.loadingPack')),
      timeClass: 'bubble-time sticker-pack-time',
    }, ctx),
  };
}

function renderTextBubble(m, { lock, time, ticks }){
  const { quoteHtml, bodyHtml } = formatMessageBody(m.body || '', { out: m.out });
  // Пометка XEP-0308 (правка) рядом со временем.
  const edited = m.edited ? html`<span class="edited-tag">${t('message.edited')}</span>` : '';
  // quoteHtml/bodyHtml уже экранированы в formatMessageBody.
  // Лог звонка хранит 📞 в m.body (текст переиспользуется в ростере/уведомлениях); в готовом bodyHtml меняем этот префикс на SVG-иконку.
  const displayBodyHtml = m.call ? bodyHtml.replace(/^📞\s*/, icon('call', 'call-log-icon') + ' ') : bodyHtml;
  return { html: html`<div class="bubble">${raw(quoteHtml)}${raw(displayBodyHtml)}<span class="bubble-time">${lock}${edited}${time}${ticks}</span></div>` };
}

// Выбирает рендерер по singleMedia; без единственного медиа - текстовый.
export function renderBubble(m, singleMedia, ctx){
  if(!singleMedia) return renderTextBubble(m, ctx);
  if(singleMedia.kind === 'stickerpack') return renderStickerPackBubble(singleMedia, ctx);
  if(singleMedia.kind === 'audio' || singleMedia.encrypted) return renderMediaBubble(m, singleMedia, ctx);
  return renderPlainImageBubble(m, singleMedia, ctx);
}
