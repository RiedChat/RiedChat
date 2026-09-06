// ===================== net/upload.js =====================
// Оркестратор загрузки файла и отправки его в чат: очередь, выбор
// шифрования и связка slot → encrypt → transport → sendMessage.
// Сами шаги - в net/upload/slot.js, net/upload/encrypt.js, net/upload/transport.js.
import { $, toast } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { uploadEncrypt } from './upload/encrypt.js';
import { uploadSlot } from './upload/slot.js';
import { uploadTransport } from './upload/transport.js';
import { captureVideoThumb } from './upload/video-thumb.js';
import { appendThumbToLink } from './media/thumb-codec.js';
import { sendMessage, notifyEncryptionFallback, buildQuotedBody } from './messaging/outgoing.js';
import { renderReplyBar } from '../ui/chat-head.js';
import { media } from './media.js';
import { history } from './history.js';
import { t } from '../i18n/t.js';

const S = state;

// Внутренняя очередь: сама отправка текстовых сообщений (net/messaging/outgoing.js)
// через неё не идёт и ничем не блокируется - очередь нужна только чтобы
// несколько ЗАГРУЗОК (например, файл + голосовое, отправленные почти
// одновременно в разные чаты) не делили один и тот же прогресс-бар в UI.
let _uploadChain = Promise.resolve();

// opts.stickerCacheId - локальный id стикера (features/stickers/storage.js),
// если файл - стикер. С ним включается кэш ссылок (см. _sendViaCachedLink
// ниже): один и тот же стикер повторно не заливается на upload-сервис ни
// себе, ни собеседнику - переиспользуется уже когда-то полученная ссылка.
export function uploadAndSend(file, queueLabel, opts){
  // Фиксируем адресата ЗДЕСЬ, синхронно, до какой-либо очереди/await -
  // раньше S.activeChat перечитывался в трёх разных местах уже во время
  // асинхронной загрузки, и если пользователь успевал переключиться на
  // другой чат (например, чтобы написать кому-то ещё, пока файл грузится),
  // готовый файл в итоге уходил в ТОТ ЧАТ, что стал активным к моменту
  // завершения загрузки, а не в тот, для которого его выбирали.
  const targetJid = S.activeChat;
  if(!targetJid){ toast(t('upload.selectContactFirst')); return Promise.resolve(); }
  if(!S.uploadComponentJid){ toast(t('upload.serviceNotFound')); return Promise.resolve(); }

  // Активную цитату (см. features/message-swipe/quote.js:startReply) захватываем
  // ЗДЕСЬ ЖЕ, синхронно, по той же причине, что и targetJid чуть выше: отправка
  // файла не мгновенная (шифрование, сетевой аплоад, очередь), а раньше эта
  // функция вообще не заглядывала в S.replyTo - активная цитата над полем ввода
  // молча терялась, и файл/фото/видео/кружок/стикер всегда уходил ОТДЕЛЬНЫМ
  // сообщением без её текста/автора, хотя плашка "Ответ ..." оставалась видна
  // так, будто цитата вот-вот применится. S.replyTo не трогаем и не гасим
  // немедленно - только если сама отправка успешно случится (см. _clearReplyToIfStillSame
  // ниже), иначе при ошибке загрузки цитата, как и при обычной текстовой
  // отправке, должна остаться на месте для повторной попытки.
  const replyTo = S.replyTo;
  const run = () => _runUpload(file, queueLabel, targetJid, opts || {}, replyTo);

  // Ставим в очередь ПОСЛЕ текущей загрузки (если она ещё идёт), а не
  // запускаем параллельно - чтобы два xhr не писали в один и тот же
  // #upload-progress одновременно. .then(run, run) - чтобы даже если что-то
  // пошло не так в предыдущем звене цепочки, очередь не заклинило навсегда.
  _uploadChain = _uploadChain.then(run, run);
  return _uploadChain;
}

// Ключ кэша ссылок отдельный для OMEMO-варианта и для обычного https -
// это разные файлы на upload-сервисе (шифротекст vs исходник) с разными
// ссылками, и какой из них нужен, зависит от того, включён ли OMEMO
// именно в ЭТОМ чате (chatIsE2ECapable может отличаться от чата к чату
// для одного и того же стикера).
function _stickerCacheKey(stickerId, useE2E){
  return 'stickerLink:' + stickerId + ':' + (useE2E ? 'e2e' : 'plain');
}

// Оборачивает ссылку на файл в блок цитаты (см. net/messaging/outgoing/compose.js:
// buildQuotedBody), если на момент СТАРТА этой загрузки была активна цитата -
// иначе просто голая ссылка, как раньше.
function _composeBody(replyTo, link){
  return replyTo ? buildQuotedBody(replyTo, link) : link;
}

// Гасит цитату и плашку над полем ввода ПОСЛЕ успешной отправки - но только если
// S.replyTo за время загрузки не поменялся на другую (пользователь не отменил и не
// навёл цитату на другое сообщение, что создаёт новый объект в S.replyTo, и не
// переключил чат, что явно сбрасывает S.replyTo в null, см. app.js). Сравнение по
// ссылке (===), а не просто "S.replyTo не null", - иначе можно было бы погасить
// чужую, уже более новую цитату, зависшую над полем ввода для другого сообщения.
function _clearReplyToIfStillSame(replyTo){
  if(replyTo && S.replyTo === replyTo){
    S.replyTo = null;
    renderReplyBar();
  }
}

async function _runUpload(file, queueLabel, targetJid, opts, replyTo){
  // getDeviceList без forceRefresh: кэш поддерживается актуальным пуш-уведомлениями
  // PEP (см. crypto/omemo/device-list-discovery.js:_applyPushedDeviceList и +notify caps в
  // net/presence/caps.js) - как только собеседник публикует ключи, мы узнаём об этом
  // событийно, без сетевого round-trip перед каждой загрузкой файла.
  const chatIsE2ECapable = omemo.enabled && omemo.ready &&
    (await omemo.getDeviceList(targetJid)).length > 0;
  const {useE2E, skippedForSize, declaredSize} = uploadEncrypt.decide(file, chatIsE2ECapable);

  // Превью-кадр для видео - см. net/media/thumb-codec.js о том, как оно
  // едет вместе со ссылкой, и net/upload/video-thumb.js/features/video-note/
  // recording-stop.js о том, как оно добывается. opts.thumbnailB64url уже
  // готов, если файл - кружок (кадр снят прямо с канваса записи, см.
  // features/video-note/preview.js); для обычного видеофайла, выбранного
  // из галереи/файловой системы, считаем его здесь же, ПАРАЛЛЕЛЬНО со
  // слотом/шифрованием/аплоадом ниже, а не последовательно после них -
  // декодирование одного кадра в браузере обычно быстрее, чем сама
  // загрузка файла, так что к моменту отправки сообщения результат уже
  // готов и отправку лишний раз не задерживает.
  // Только для useE2E: превью встраивается исключительно в aesgcm-ссылку
  // (см. ниже) - без OMEMO decode-затраты на кадр были бы чистыми
  // потерями без потребителя.
  const kind = media.kindOfMime(file.type) || media.kindOf(media.extOf(file.name || ''));
  const isVideoFile = kind === 'video';
  const thumbPromise = !useE2E ? Promise.resolve(null) : (opts.thumbnailB64url
    ? Promise.resolve(opts.thumbnailB64url)
    : (isVideoFile ? captureVideoThumb(file) : Promise.resolve(null)));

  const cacheKey = opts.stickerCacheId ? _stickerCacheKey(opts.stickerCacheId, useE2E) : null;
  if(cacheKey){
    const cached = await history.getMeta(cacheKey).catch(() => null);
    if(cached && cached.url){
      // Стикер уже когда-то был залит на upload-сервис (этим же файлом с этого
      // устройства) - шлём ту же самую ссылку вместо повторной заливки бинарника.
      // Собеседник, если уже открывал этот же стикер раньше, получит его из
      // своего постоянного кэша (net/media.js:decrypt/media-cache), даже не
      // обращаясь к серверу - сообщение с ОДИНАКОВОЙ ссылкой для него уже
      // "знакомое". Риск: если файл когда-нибудь удалят с upload-сервиса по
      // истечении срока хранения, старая ссылка перестанет открываться -
      // тогда стикер просто зальётся заново при следующей отправке этого же
      // стикера, ниже, когда cacheKey не найдётся (сервис вернёт 404 на GET,
      // и после следующей чистки этого меты можно будет форсировать переотправку).
      const linkToSend = useE2E ? uploadEncrypt.buildAesgcmLink(cached.url, cached.aesKeyIvHex) : cached.url;
      media.primeLocalBlob(linkToSend, file);
      const {fallbackReason} = await sendMessage(targetJid, _composeBody(replyTo, linkToSend));
      notifyEncryptionFallback(fallbackReason);
      _clearReplyToIfStillSame(replyTo);
      return;
    }
  }

  let slot;
  try{
    slot = await uploadSlot.requestSlot({
      filename: file.name,
      declaredSize,
      contentType: useE2E ? 'application/octet-stream' : (file.type || 'application/octet-stream'),
    });
  }catch(err){
    toast(err.reason);
    return;
  }

  // ---- XEP-0454 (OMEMO Media Sharing): шифруем файл, если чат защищён OMEMO ----
  let uploadBlob = file;
  let aesKeyIvHex = null;
  if(useE2E){
    const enc = await uploadEncrypt.encryptFile(file);
    uploadBlob = enc.blob;
    aesKeyIvHex = enc.keyIvHex;
  }

  const contactName = (S.roster[targetJid] && S.roster[targetJid].name) || targetJid;
  $('upload-progress').style.display = 'flex';
  $('upload-label').textContent = contactName + ': ' + (queueLabel ? queueLabel + ' ' : '') + file.name;
  $('upload-bar-fill').style.width = '0%';
  $('upload-pct').textContent = '0%';
  if(skippedForSize){
    toast(t('upload.largeFileNoE2E', {size: Math.round(uploadEncrypt.MAX_E2E_ENCRYPT_BYTES/1024/1024)}));
  } else if(!aesKeyIvHex && chatIsE2ECapable){
    toast(t('upload.plainLinkWarning'));
  }

  const {ok} = await uploadTransport.put({putUrl: slot.putUrl, headers: slot.headers, blob: uploadBlob, putHost: slot.putHost});
  if(!ok) return;

  if(cacheKey){
    const toStore = aesKeyIvHex ? {url: slot.getUrl, aesKeyIvHex} : {url: slot.getUrl};
    history.setMeta(cacheKey, toStore).catch(e => history.reportWriteError(e, t('history.ctxStickerLink')));
  }

  let linkToSend = slot.getUrl;
  if(aesKeyIvHex){
    linkToSend = uploadEncrypt.buildAesgcmLink(slot.getUrl, aesKeyIvHex);
    // Превью встраиваем ТОЛЬКО в aesgcm-вариант: только он и получает
    // специальный рендер (круглый/16:9 плеер с постером, см.
    // ui/chat-view/message-body-html.js/bubble-renderers.js) - обычная
    // https-ссылка на видео пока показывается просто ссылкой, встраивать
    // в неё превью было бы мёртвым грузом без потребителя.
    const thumbB64url = await thumbPromise;
    if(thumbB64url) linkToSend = appendThumbToLink(linkToSend, thumbB64url);
  }
  // Файл уже лежит у нас на руках как plaintext (тот же `file`, что
  // грузили) - кладём его в кэш медиа ПОД ТОЙ ЖЕ ссылкой, что уйдёт
  // в сообщение. Иначе chat-view/render-messages.js при рендере своего же исходящего
  // сообщения пошёл бы качать и заново AES-GCM-расшифровывать файл,
  // который отправитель только что сам загрузил.
  if(aesKeyIvHex && linkToSend.startsWith('aesgcm://')){
    media.primeLocalBlob(linkToSend, file);
  }
  const {fallbackReason} = await sendMessage(targetJid, _composeBody(replyTo, linkToSend));
  notifyEncryptionFallback(fallbackReason);
  _clearReplyToIfStillSame(replyTo);
}

// features/voice-recorder.js и features/file-upload.js уже используют
// реальный import { uploadAndSend } - window.App-мост здесь больше не нужен.
