// ===================== ui/chat-view/bubble-renderers.js =====================
// Рендереры отдельных типов пузыря сообщения. Выделено из
// ui/chat-view/render-messages.js - здесь чистая генерация HTML по типу
// сообщения, без цикла по списку и без работы с DOM списка целиком.
// Каждый рендерер принимает разобранное сообщение/singleMedia и общие поля
// разметки ({lock, time, ticks, nextSeq}) и возвращает {html, media}, где
// media - список того, что нужно догрузить ПОСЛЕ вставки html в DOM:
// {type:'deferrable', id, url, holdOff} - голосовые теперь тоже идут этим
// типом (см. features/audio-settings.js), а не отдельным 'voice' без holdOff.
import { html, raw } from '../../core/safe-html.js';
import { escapeHtml } from '../../core/dom-utils.js';
import { media } from '../../net/media.js';
import { formatMessageBody } from './message-body-html.js';
import { loadVideoAutoDownloadEnabled } from '../../features/video-settings.js';
import { loadAudioAutoDownloadEnabled } from '../../features/audio-settings.js';
import { loadVideoNoteAutoDownloadEnabled } from '../../features/video-note-settings.js';
import { loadImageAutoDownloadEnabled } from '../../features/image-settings.js';
import { loadStickerAutoDownloadEnabled } from '../../features/sticker-settings.js';
import { loadFileAutoDownloadEnabled } from '../../features/file-settings.js';
import { isTrustedContact } from '../../net/trusted-contacts.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { ICON_CHECK } from '../../core/icons.js';

// Галочки "отправлено/прочитано" (как в Telegram) для НАШИХ исходящих сообщений:
// одна галочка - ушло с устройства, две (подсвеченные, внахлёст) - собеседник
// прислал <displayed> (XEP-0333, см. net/messaging/incoming.js:handleDisplayedMarker).
// Для входящих сообщений галочки не показываем - их не рисуем вовсе.
export function ticksHtml(m){
  if(!m || !m.out) return '';
  const read = m.status === 'read';
  const glyph = read ? ICON_CHECK + ICON_CHECK : ICON_CHECK;
  return String(html`<span class="ticks${raw(read ? ' read' : '')}" title="${read ? t('message.read') : t('message.sent')}">${raw(glyph)}</span>`);
}

function renderVoiceBubble(m, singleMedia, {lock, time, ticks, nextSeq}){
  // Голосовое/аудио - компактный пузырь с минимальными отступами (не "встык",
  // плееру нужен свой контраст с фоном, но лишний паддинг убираем).
  // Время сообщения - оверлеем в правый нижний угол пузыря (как у фото/видео,
  // см. .bubble-time.overlay), а не отдельной строкой в потоке - так оно не
  // участвует в раскладке и не может влиять на высоту пузыря.
  const id = 'media-' + nextSeq() + '-0';
  // Свои же исходящие голосовые (m.out) всегда показываем сразу - файл уже
  // есть у нас на руках (media.primeLocalBlob), скачивать нечего. Для чужих -
  // только если явно включена автозагрузка (features/audio-settings.js) ИЛИ
  // файл уже лежит в постоянном кэше с прошлой сессии.
  const alreadyCached = media.getCached(singleMedia.url);
  const notCachedYet = !(alreadyCached && alreadyCached.status === 'done');
  const holdOff = !m.out && notCachedYet && !loadAudioAutoDownloadEnabled();
  // Родительский .media-frame получает класс video-tap-load (см. ниже) -
  // именно он даёт cursor:pointer (media-messages.css:.video-tap-load), тут
  // нужна только текстовая метка без визуального веса круглой play-кнопки
  // (.video-tap-load-play рассчитана на поверх-фото/видео оверлей, здесь не подходит).
  const frameHtml = holdOff
    ? `<span class="media-loading">▶ ${t('media.tapToLoad')}</span>`
    : `<span class="media-loading">⏳ ${t('media.loading')}</span>`;
  const bubbleHtml = String(html`<div class="bubble voice-only" data-kind="audio">
    <div class="media-frame${raw(holdOff ? ' video-tap-load' : '')}" id="${id}">${raw(frameHtml)}</div>
    <span class="bubble-time overlay voice-overlay-time">${raw(lock)}${raw(time)}${raw(ticks)}</span>
  </div>`);
  return { html: bubbleHtml, media: [{type:'deferrable', id, url: singleMedia.url, holdOff}] };
}

function renderMediaOnlyBubble(m, singleMedia, {lock, time, ticks, nextSeq}){
  const id = 'media-' + nextSeq() + '-0';
  // Свои же исходящие вложения (m.out) никогда не показываем плашкой
  // "нажмите, чтобы загрузить" - файл уже есть у нас на руках
  // (см. media.primeLocalBlob в net/upload.js), скачивать нечего.
  const alreadyCached = media.getCached(singleMedia.url);
  const notCachedYet = !(alreadyCached && alreadyCached.status === 'done');
  // Кружок (features/video-note.js) - обычное video-вложение, но рисуем его
  // круглым, а не в 16:9-рамке (см. .bubble.video-note в css/media-messages.css),
  // и у него СВОЙ тумблер автозагрузки (features/video-note-settings.js),
  // отдельный от обычного видео. Стикер - обычное image-вложение (по
  // умолчанию картинки вообще не автозагружаются, см. image-settings.js),
  // но со своим тумблером (features/sticker-settings.js), т.к. стикеры
  // приходят пачками от кого угодно и логика "доверенный контакт" для
  // обычных картинок тут не годится.
  const isNote = singleMedia.kind === 'video' && media.isVideoNote(singleMedia.url);
  const isSticker = singleMedia.kind === 'image' && media.isSticker(singleMedia.url);
  const holdOff = !m.out && notCachedYet && (
    isNote ? !loadVideoNoteAutoDownloadEnabled() :
    isSticker ? !loadStickerAutoDownloadEnabled() :
    singleMedia.kind === 'video' ? !loadVideoAutoDownloadEnabled() :
    // Обычный файл-вложение (.pdf/.docx/.zip и т.п., см. features/file-settings.js) -
    // без этой ветки singleMedia.kind === 'video' был бы false и holdOff всегда
    // выходил бы false, т.е. любой файл от кого угодно скачивался бы и
    // расшифровывался сразу же, в обход настройки.
    singleMedia.kind === 'file' && !loadFileAutoDownloadEnabled()
  );
  const noteBoxClass = isNote ? 'video-note-box' : 'video-ratio-box';
  const tapIcon = isSticker ? '🖼️' : singleMedia.kind === 'file' ? '📎' : '▶';
  // Имя и расширение файла (.apk/.zip/.pdf и т.п.) видны прямо в самой
  // aesgcm-ссылке ДО расшифровки - показываем их уже на плашке
  // "нажмите, чтобы загрузить", а не только после тапа (см. media-loader.js).
  const fileName = singleMedia.kind === 'file' ? media.fileNameOf(singleMedia.url) : '';
  const fileExt = singleMedia.kind === 'file' ? media.extOf(fileName).toUpperCase() : '';
  // Превью, встроенное отправителем в саму ссылку (см.
  // net/media/thumb-codec.js) - показываем СРАЗУ фоном плейсхолдера, ещё
  // до скачивания/расшифровки и даже до тапа "загрузить". Только для
  // видео/кружков - extractThumbDataUrl для картинок/стикеров всегда null
  // (незачем: картинка сама по себе и есть свой собственный кадр).
  const thumbDataUrl = singleMedia.kind === 'video' ? media.extractThumbDataUrl(singleMedia.url) : null;
  const thumbStyle = thumbDataUrl ? ` style="background-image:url('${thumbDataUrl}');background-size:cover;background-position:center"` : '';
  // Для файла показываем имя/тип уже на самой плашке "нажмите, чтобы
  // загрузить" - до тапа и расшифровки (имя видно прямо в ссылке, см.
  // fileName/fileExt выше); экранируем вручную - в отличие от html`...`
  // ниже по файлу, frameHtml тут собирается обычной строкой.
  const fileNameCaption = singleMedia.kind === 'file'
    ? `<span class="file-tap-load-name">${escapeHtml(fileName)}${fileExt ? ' · ' + escapeHtml(fileExt) : ''}</span>`
    : '';
  const frameHtml = holdOff
    ? `<div class="${noteBoxClass}"${thumbStyle}><div class="video-tap-load-overlay"><span class="video-tap-load-play">${tapIcon}</span>${fileNameCaption}</div></div>`
    : `<span class="media-loading"${thumbStyle}>⏳ ${t('media.loading')}</span>`;
  // singleMedia.kind - 'image'/'video'/'audio'/'file', только из media.kindOf
  // (фиксированный набор строк), не пользовательский ввод - raw ок.
  const bubbleHtml = String(html`<div class="bubble media-only${raw(isNote ? ' video-note' : '')}" data-kind="${singleMedia.kind}">
    <div class="media-frame${raw(holdOff ? ' video-tap-load' : '')}" id="${id}">${raw(frameHtml)}</div>
    <span class="bubble-time overlay">${raw(lock)}${raw(time)}${raw(ticks)}</span>
  </div>`);
  return { html: bubbleHtml, media: [{type:'deferrable', id, url: singleMedia.url, holdOff}] };
}

function renderPlainImageBubble(m, singleMedia, {lock, time, ticks, nextSeq}){
  // Незашифрованная ссылка на картинку - URL уже готов, дата-атрибуты
  // для свайп-скачивания можно проставить сразу, без ожидания decrypt().
  const fileName = decodeURIComponent((singleMedia.url.split('/').pop() || '').split('?')[0]) || 'image.jpg';
  // Как и в message-body-html.js: свои исходящие показываем сразу, чужие -
  // только если явно включена автозагрузка (по умолчанию выключена) И контакт
  // доверенный (см. net/trusted-contacts.js, riedchat-security-plan.md, п.5).
  const autoLoad = m.out || (loadImageAutoDownloadEnabled() && isTrustedContact(state.activeChat));
  const id = 'media-' + nextSeq() + '-0';
  const frameHtml = autoLoad
    ? `<a href="${escapeHtml(singleMedia.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(singleMedia.url)}"></a>`
    // Заглушка сама по себе не ссылка - по клику media-loader.js:loadPlainImage
    // подменяет её на настоящий <img> прямо в пузыре (см. renderMediaOnlyBubble
    // выше для того же паттерна на видео).
    : '<span class="video-ratio-box"><span class="video-tap-load-overlay"><span class="video-tap-load-play">🖼️</span></span></span>';
  // singleMedia.url приходит из тела сообщения собеседника - экранируем
  // через html, даже находясь внутри HTML-атрибута (кавычки/угловые
  // скобки в url иначе позволили бы вырваться из атрибута).
  const bubbleHtml = String(html`<div class="bubble media-only" data-kind="image" data-download-url="${singleMedia.url}" data-download-name="${fileName}">
    <div class="media-frame${raw(autoLoad ? '' : ' image-tap-load video-tap-load')}" id="${id}">${raw(frameHtml)}</div>
    <span class="bubble-time overlay">${raw(lock)}${raw(time)}${raw(ticks)}</span>
  </div>`);
  return { html: bubbleHtml, media: autoLoad ? [] : [{type:'plain-image', id, url: singleMedia.url}] };
}

// Пак стикеров (features/stickers/share.js) - карточку с превью/названием/
// кнопкой "Добавить" рисует features/stickers/pack-card.js уже ПОСЛЕ того,
// как архив скачался и распарсился (нужна сеть + разбор zip, синхронно
// сюда не уместить) - здесь только заглушка-плейсхолдер, как у voice/video.
function renderStickerPackBubble(singleMedia, {lock, time, ticks, nextSeq}){
  const id = 'media-' + nextSeq() + '-0';
  const bubbleHtml = String(html`<div class="bubble sticker-pack-bubble" data-kind="stickerpack">
    <div class="sticker-pack-card" id="${id}"><span class="media-loading">⏳ ${t('stickers.loadingPack')}</span></div>
    <span class="bubble-time sticker-pack-time">${raw(lock)}${raw(time)}${raw(ticks)}</span>
  </div>`);
  return { html: bubbleHtml, media: [{type:'stickerpack', id, url: singleMedia.url}] };
}

function renderTextBubble(m, {lock, time, ticks, nextSeq}){
  const { quoteHtml, bodyHtml, mediaPlaceholders, quoteMedia } = formatMessageBody(m.body || '', { out: m.out, nextSeq });
  // Сообщение исправлено через XEP-0308 (см. net/messaging/outgoing.js:editMessage
  // и net/messaging/incoming.js:handleCorrection) - небольшая пометка рядом со
  // временем, как "edited" в Telegram.
  const edited = m.edited ? String(html`<span class="edited-tag">${t('message.edited')}</span>`) : '';
  // quoteHtml/bodyHtml уже полностью экранированы внутри formatMessageBody
  // (escapeHtml применяется там до любой подстановки медиа-плейсхолдеров).
  const bubbleHtml = String(html`<div class="bubble">${raw(quoteHtml)}${raw(bodyHtml)}<span class="bubble-time">${raw(lock)}${raw(edited)}${raw(time)}${raw(ticks)}</span></div>`);
  const mediaList = mediaPlaceholders.map(({id, url, holdOff, kind}) => ({type: kind === 'plain-image' ? 'plain-image' : 'deferrable', id, url, holdOff}));
  // Миниатюра внутри самой цитаты (фото/видео/кружок/стикер) - отдельный тип
  // догрузки, см. ui/chat-view/media-loader.js:loadQuoteThumb и render-messages.js.
  if(quoteMedia) mediaList.push({type: 'quote-thumb', id: quoteMedia.id, url: quoteMedia.url, kind: quoteMedia.kind, isNote: quoteMedia.isNote, holdOff: quoteMedia.holdOff});
  return { html: bubbleHtml, media: mediaList };
}

// Выбирает и вызывает нужный рендерер по типу singleMedia (или текстовый,
// если сообщение без единственного медиа-вложения).
export function renderBubble(m, singleMedia, ctx){
  if(singleMedia && singleMedia.kind === 'stickerpack') return renderStickerPackBubble(singleMedia, ctx);
  if(singleMedia && singleMedia.kind === 'audio') return renderVoiceBubble(m, singleMedia, ctx);
  if(singleMedia && singleMedia.encrypted) return renderMediaOnlyBubble(m, singleMedia, ctx);
  if(singleMedia) return renderPlainImageBubble(m, singleMedia, ctx);
  return renderTextBubble(m, ctx);
}


