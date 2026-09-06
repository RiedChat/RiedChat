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
import { sendMessage, notifyEncryptionFallback } from './messaging/outgoing.js';
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

  const run = () => _runUpload(file, queueLabel, targetJid, opts || {});

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

async function _runUpload(file, queueLabel, targetJid, opts){
  // getDeviceList без forceRefresh: кэш поддерживается актуальным пуш-уведомлениями
  // PEP (см. crypto/omemo/device-list-discovery.js:_applyPushedDeviceList и +notify caps в
  // net/presence/caps.js) - как только собеседник публикует ключи, мы узнаём об этом
  // событийно, без сетевого round-trip перед каждой загрузкой файла.
  const chatIsE2ECapable = omemo.enabled && omemo.ready &&
    (await omemo.getDeviceList(targetJid)).length > 0;
  const {useE2E, skippedForSize, declaredSize} = uploadEncrypt.decide(file, chatIsE2ECapable);

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
      const {fallbackReason} = await sendMessage(targetJid, linkToSend);
      notifyEncryptionFallback(fallbackReason);
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
  }
  // Файл уже лежит у нас на руках как plaintext (тот же `file`, что
  // грузили) - кладём его в кэш медиа ПОД ТОЙ ЖЕ ссылкой, что уйдёт
  // в сообщение. Иначе chat-view/render-messages.js при рендере своего же исходящего
  // сообщения пошёл бы качать и заново AES-GCM-расшифровывать файл,
  // который отправитель только что сам загрузил.
  if(aesKeyIvHex && linkToSend.startsWith('aesgcm://')){
    media.primeLocalBlob(linkToSend, file);
  }
  const {fallbackReason} = await sendMessage(targetJid, linkToSend);
  notifyEncryptionFallback(fallbackReason);
}

// features/voice-recorder.js и features/file-upload.js уже используют
// реальный import { uploadAndSend } - window.App-мост здесь больше не нужен.
