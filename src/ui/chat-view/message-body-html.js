// ===================== ui/chat-view/message-body-html.js =====================
// Чистая (без DOM, без сети) логика "что за медиа в этом сообщении" и разбор
// текста сообщения в HTML: цитата (см. net/messaging/outgoing.js:buildQuotedBody) и
// инлайн-медиа/ссылки в теле. Не создаёт DOM-узлов и не грузит медиа - только
// строит разметку и список плейсхолдеров; их догрузку (loadEncryptedMedia /
// _loadMediaOrDeferForVideo) делает вызывающий код в render-messages.js
// после вставки готовой разметки в DOM.
import { escapeHtml } from '../../core/dom-utils.js';
import { IMG_RE, URL_RE, splitQuotedBody } from '../../core/text-patterns.js';
import { media } from '../../net/media.js';
import { mediaLabel } from '../../features/message-swipe.js';
import { loadVideoAutoDownloadEnabled } from '../../features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../features/image-settings.js';
import { loadFileAutoDownloadEnabled } from '../../features/file-settings.js';
import { isTrustedContact } from '../../net/trusted-contacts.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

// Определяет, является ли тело сообщения ЦЕЛИКОМ одной ссылкой на фото/видео/аудио
// (без сопровождающего текста) - для фото/видео применяется "встык"-рендер
// без рамки-паддинга (см. .bubble.media-only в CSS), для голосовых/аудио -
// компактный пузырь с минимальными отступами (см. .bubble.voice-only), как в Telegram.
export function classifySingleMedia(raw){
  const trimmed = String(raw || '').trim();
  if(!trimmed) return null;
  const aesMatches = trimmed.match(media.AESGCM_RE);
  if(aesMatches && aesMatches.length === 1 && aesMatches[0] === trimmed){
    const kind = media.kindOf(media.extOf(trimmed));
    if(kind === 'image' || kind === 'video' || kind === 'audio') return {encrypted:true, kind, url: trimmed};
    // Пак стикеров (features/stickers/share.js) - обычное зашифрованное
    // вложение, kind тут вернётся 'file' (.zip не входит в image/video/audio
    // в net/media/mime-kind.js:kindOf) - опознаём отдельно по фиксированному
    // имени файла "stickers.zip" (см. isStickerPack) и рисуем карточкой
    // "Добавить пак" (bubble-renderers.js/features/stickers/pack-card.js),
    // а не голой ссылкой на файл.
    if(kind === 'file' && media.isStickerPack(trimmed)) return {encrypted:true, kind:'stickerpack', url: trimmed};
    return null;
  }
  const urlMatches = trimmed.match(URL_RE);
  if(urlMatches && urlMatches.length === 1 && urlMatches[0] === trimmed){
    if(IMG_RE.test(trimmed)) return {encrypted:false, kind:'image', url: trimmed};
    // Незашифрованный (не OMEMO) пак стикеров - тот же маркер по имени файла.
    if(media.isStickerPack(trimmed)) return {encrypted:false, kind:'stickerpack', url: trimmed};
  }
  return null;
}

// Разбирает тело обычного (не single-media) сообщения: вычленяет блок
// цитаты и заменяет инлайн aesgcm://-медиа и обычные ссылки/картинки на
// HTML-плейсхолдеры. nextSeq() - функция-счётчик id, общая на весь рендер
// списка сообщений (передаётся снаружи, чтобы id не повторялись между
// сообщениями). Возвращает {quoteHtml, bodyHtml, mediaPlaceholders, quoteMedia},
// где mediaPlaceholders - [{id, url, holdOff}] для последующей догрузки, а
// quoteMedia (если цитата ссылается на фото/видео/кружок/стикер) -
// {id, url, kind, isNote} для отдельной догрузки миниатюры внутри самой цитаты
// (см. ui/chat-view/media-loader.js:loadQuoteThumb).
export function formatMessageBody(rawBody, {out, nextSeq}){
  let mainBody = rawBody || '';
  let quoteHtml = '';
  let quoteMedia = null;
  let mediaIdx = 0;
  const mediaPlaceholders = [];
  const quoteSplit = splitQuotedBody(mainBody);
  if(quoteSplit){
    // data-quote-text - не для отображения, а для клика по цитате (см.
    // features/quote-jump.js): по нему ищем в истории чата сообщение, на
    // которое эта цитата ссылается (протокол текстовый, id оригинала в теле
    // не передаётся). Для цитаты медиа-сообщения quoteSplit.quoted - это
    // голая ссылка на файл (см. features/message-swipe.js:startReply), а не
    // текст для человека - поэтому для ОТОБРАЖЕНИЯ распознаём её тем же
    // способом, что и обычное инлайн-медиа в теле (classifySingleMedia
    // выше), и рисуем дружелюбную метку вместо сырой ссылки; data-quote-text
    // при этом остаётся точной ссылкой, чтобы клик находил именно то
    // сообщение, а не любое той же природы (фото/видео/голосовое).
    const quotedMedia = classifySingleMedia(quoteSplit.quoted);
    const quoteDisplayText = quotedMedia ? mediaLabel(quotedMedia.kind, quoteSplit.quoted) : quoteSplit.quoted;
    const idAttr = quoteSplit.id === null ? '' : ` data-quote-id="${escapeHtml(quoteSplit.id)}"`;
    // Миниатюра внутри цитаты - только для того, что реально можно показать
    // картинкой (фото/видео, включая кружки и стикеры - технически это тот
    // же image/video-kind, см. features/message-swipe/shared.js:mediaLabel).
    // Голосовые/файлы/паки стикеров такого превью не получают - для них
    // текстовой метки (📎 Файл и т.п.) достаточно, а плеер/карточка внутри
    // самой цитаты был бы избыточен.
    let quoteThumbHtml = '';
    if(quotedMedia && (quotedMedia.kind === 'image' || quotedMedia.kind === 'video')){
      const isNote = quotedMedia.kind === 'video' && media.isVideoNote(quotedMedia.url);
      const thumbClass = 'quote-thumb' + (isNote ? ' quote-thumb-round' : '');
      if(quotedMedia.encrypted){
        // aesgcm:// - расшифровывается асинхронно (тот же net/media.js:decrypt,
        // что и для обычного инлайн-медиа выше) - ставим плейсхолдер и просим
        // догрузить после вставки в DOM (см. bubble-renderers.js/render-messages.js).
        // Та же проверка автозагрузки, что и для инлайн-медиа/незашифрованных
        // картинок ниже - иначе цитата тихо скачивает и расшифровывает вложение
        // в обход выключенной настройки. Если автозагрузка выключена, ставим
        // ту же плашку "нажмите, чтобы загрузить" - реальная расшифровка (см.
        // media-loader.js:_loadQuoteThumbOrDefer) запускается только по тапу.
        const thumbId = 'quote-thumb-' + nextSeq();
        const holdOff = !(out || (loadImageAutoDownloadEnabled() && isTrustedContact(state.activeChat)));
        quoteThumbHtml = holdOff
          ? `<div class="${thumbClass} image-tap-load video-tap-load" id="${thumbId}"><span class="video-tap-load-overlay"><span class="video-tap-load-play">🖼️</span></span></div>`
          : `<div class="${thumbClass}" id="${thumbId}"></div>`;
        quoteMedia = { id: thumbId, url: quotedMedia.url, kind: quotedMedia.kind, isNote, holdOff };
      } else if(quotedMedia.kind === 'image'){
        // Незашифрованная картинка - открытый https-URL. Раньше показывали
        // сразу, игнорируя image-settings.js - тот же tracking-pixel риск,
        // что и с обычной инлайн-картинкой (см. п.5 security-plan.md), просто
        // спрятанный внутри цитаты. Применяем ту же проверку, что и ниже для
        // обычных инлайн-картинок (out || автозагрузка+доверенный контакт).
        if(out || (loadImageAutoDownloadEnabled() && isTrustedContact(state.activeChat))){
          quoteThumbHtml = `<div class="${thumbClass}"><img src="${escapeHtml(quotedMedia.url)}" loading="lazy"></div>`;
        } else {
          const thumbId = 'quote-thumb-' + nextSeq();
          quoteThumbHtml = `<div class="${thumbClass} image-tap-load video-tap-load" id="${thumbId}"><span class="video-tap-load-overlay"><span class="video-tap-load-play">🖼️</span></span></div>`;
          mediaPlaceholders.push({id: thumbId, url: quotedMedia.url, kind: 'plain-image', holdOff: true});
        }
      }
    }
    quoteHtml = `<div class="quote-block" data-quote-author="${escapeHtml(quoteSplit.author)}" data-quote-text="${escapeHtml(quoteSplit.quoted)}"${idAttr}>${quoteThumbHtml}<div class="quote-block-text">${quoteSplit.author ? `<span class="quote-author">${escapeHtml(quoteSplit.author)}</span>` : ''}${escapeHtml(quoteDisplayText)}</div></div>`;
    mainBody = quoteSplit.rest;
  }
  let bodyHtml = escapeHtml(mainBody.trim());
  // aesgcm:// - зашифрованные (XEP-0454) файлы, их сначала нужно скачать
  // и расшифровать в браузере, поэтому ставим плейсхолдер с data-атрибутом
  // и заполняем его асинхронно снаружи через media.decrypt().
  bodyHtml = bodyHtml.replace(media.AESGCM_RE, (u) => {
    const id = 'media-' + nextSeq() + '-' + (mediaIdx++);
    // Класс audio-embed ставим уже сейчас (kind известен синхронно по расширению
    // ссылки, расшифровка ещё не нужна) - чтобы ужать голосовой плеер под его
    // реальный размер через обычный класс, не полагаясь на :has() в CSS
    // (в части WebView на Android :has() не поддерживается, и правило на нём
    // просто молча не срабатывает).
    const kind = media.kindOf(media.extOf(u));
    // Кружок (features/video-note.js) - тот же video-kind, но круглый плеер
    // 200x200 вместо рамки 16:9 (см. renderMediaOnlyBubble в bubble-renderers.js
    // для "чистого" медиа-сообщения). Раньше здесь, в инлайн-рендере (когда
    // видео/кружок отправлено ВМЕСТЕ с цитатой и попадает в текстовый пузырь,
    // а не в media-only), эта проверка отсутствовала вовсе - любой кружок
    // рисовался обычной растянутой 16:9-рамкой.
    const isNote = kind === 'video' && media.isVideoNote(u);
    const extraClass = kind === 'audio' ? ' audio-embed' : isNote ? ' video-note-embed' : '';
    const cachedEntry = media.getCached(u);
    const alreadyDone = cachedEntry && cachedEntry.status === 'done';
    // Обычный файл-вложение (.pdf/.docx/.zip и т.п.), отправленный ВМЕСТЕ с
    // текстом/цитатой (иначе это singleMedia, см. bubble-renderers.js) - та же
    // проверка настройки, что и у видео чуть ниже, иначе файл в инлайн-виде
    // тихо скачивался и расшифровывался бы в обход выключенного тумблера
    // (см. features/file-settings.js).
    const holdOff = !out && !alreadyDone && (
      kind === 'video' ? !loadVideoAutoDownloadEnabled() :
      kind === 'file' && !loadFileAutoDownloadEnabled()
    );
    mediaPlaceholders.push({id, url: u, holdOff});
    // Превью, встроенное отправителем в саму ссылку (см.
    // net/media/thumb-codec.js) - показываем его СРАЗУ фоном плейсхолдера,
    // ещё до скачивания/расшифровки самого видео (а для holdOff - даже до
    // тапа пользователя). extractThumbDataUrl сама проверяет содержимое на
    // допустимый base64url-алфавит, так что тут можно вставлять результат
    // без дополнительного экранирования кавычек/скобок.
    const thumbDataUrl = kind === 'video' ? media.extractThumbDataUrl(u) : null;
    const thumbStyle = thumbDataUrl ? ` style="background-image:url('${thumbDataUrl}');background-size:cover;background-position:center"` : '';
    const boxClass = isNote ? 'video-note-box' : 'video-ratio-box';
    const tapIcon = kind === 'file' ? '📎' : '▶';
    const inner = holdOff
      // span, а не div: строкой ниже bodyHtml прогоняется через regex, который
      // ищет конец media-embed по ПЕРВОМУ </div> - вложенный <div> тут обрезал
      // бы разметку на полпути.
      ? `<span class="${boxClass}"${thumbStyle}><span class="video-tap-load-overlay"><span class="video-tap-load-play">${tapIcon}</span></span></span>`
      : `<span class="media-loading"${thumbStyle}>⏳ ${t('media.loading')}</span>`;
    return `<div class="media-embed${extraClass}${holdOff ? ' video-tap-load' : ''}" id="${id}">${inner}</div>`;
  });
  bodyHtml = bodyHtml.replace(URL_RE, (u) => {
    if(media.isAesgcm(u)) return u; // уже обработано выше
    if(IMG_RE.test(u)){
      // Свои же исходящие ссылки (out) всегда показываем сразу - это то,
      // что отправил сам пользователь, скрывать нечего. Для входящих -
      // только если явно включена автозагрузка (по умолчанию выключена,
      // см. features/image-settings.js) И контакт доверенный (добавлен
      // вручную или есть история переписки, см. net/trusted-contacts.js) -
      // иначе непроверенный/новый JID мог бы использовать голую ссылку как
      // tracking pixel даже при включённом общем тумблере (riedchat-security-plan.md, п.5).
      if(out || (loadImageAutoDownloadEnabled() && isTrustedContact(state.activeChat))){
        return `<a href="${u}" target="_blank" rel="noopener"><img src="${u}"></a>`;
      }
      // Вместо автозагрузки - кликабельная заглушка с той же 16:9-рамкой, что
      // и у видео. По тапу media-loader.js:loadPlainImage подменяет плейсхолдер
      // на настоящий <img> прямо в пузыре (не открытие в отдельной вкладке).
      const id = 'media-' + nextSeq() + '-' + (mediaIdx++);
      mediaPlaceholders.push({id, url: u, kind: 'plain-image', holdOff: true});
      return `<div class="media-embed image-tap-load video-tap-load" id="${id}"><span class="video-ratio-box"><span class="video-tap-load-overlay"><span class="video-tap-load-play">🖼️</span></span></span></div>`;
    }
    return `<a href="${u}" target="_blank" rel="noopener">${u}</a>`;
  });
  // .bubble рендерится с white-space:pre-wrap, поэтому пустые строки, которые
  // некоторые клиенты оставляют вокруг вложения (перевод строки до и после
  // ссылки), превращаются в видимые пустые строки и раздувают пузырь по
  // высоте - плеер/картинка при этом визуально «уезжает» от текста времени.
  // Блочные вставки медиа сами создают перенос, поэтому переносы строк
  // вокруг них не нужны - убираем.
  bodyHtml = bodyHtml.replace(/(\n[ \t]*)*(<div class="media-embed[^"]*"[^>]*>[\s\S]*?<\/div>)([ \t]*\n)*/g, '$2');
  return { quoteHtml, bodyHtml, mediaPlaceholders, quoteMedia };
}

