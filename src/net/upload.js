// ===================== net/upload.js =====================
// Оркестратор загрузки файла и отправки в чат: очередь, проверка возможности шифрования, цепочка slot -> encrypt -> transport -> sendMessage.
// Шаги - net/upload/slot.js, encrypt.js, transport.js.
import { toast, contactName } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { t } from '../i18n/t.js';
import { renderReplyBar } from '../ui/chat-head.js';
import * as uploadProgress from '../ui/upload-progress.js';

import { history } from './history.js';
import { kindOfFile, fileNameFragment } from './media/mime-kind.js';
import { appendThumbToLink } from './media/thumb-codec.js';
import { media } from './media.js';
import { buildQuotedBody } from './messaging/outgoing/compose.js';
import { notifyNotSent } from './messaging/outgoing/encrypt-required.js';
import { sendMessage } from './messaging/outgoing/send.js';
import { uploadEncrypt } from './upload/encrypt.js';
import { requestSlot } from './upload/slot.js';
import { putFile } from './upload/transport.js';
import { captureVideoThumb } from './upload/video-thumb.js';


// Очередь только для ЗАГРУЗОК (файл + голосовое почти одновременно в разные чаты не делят прогресс-бар в UI);
// текстовые сообщения (net/messaging/outgoing.js) через неё не идут и ею не блокируются.
let _uploadChain = Promise.resolve();

// opts.stickerCacheId - локальный id стикера (features/stickers/storage/stickers.js). С ним включается
// кэш ссылок (_sendViaCachedLink): стикер не заливается повторно, переиспользуется полученная ссылка.
export async function uploadAndSend(file, queueLabel, opts = {}){
  const targetJid = state.activeChat;
  if(!targetJid){ toast(t('upload.selectContactFirst')); return; }
  if(!state.uploadComponentJid){ toast(t('upload.serviceNotFound')); return; }
  const replyTo = state.replyTo;
  const run = () => _runUpload(file, queueLabel, targetJid, opts, replyTo);
  _uploadChain = _uploadChain.then(run, run);
  return _uploadChain;
}

async function _deliver(targetJid, replyTo, link, file){
  const body = replyTo ? buildQuotedBody(replyTo, link) : link;
  await sendMessage(targetJid, body, file.name);
  if(replyTo && state.replyTo === replyTo){ state.replyTo = null; renderReplyBar(); }
}

async function _runUpload(file, queueLabel, targetJid, opts, replyTo){
  // Вложения уходят только зашифрованными: без OMEMO у нас или у собеседника, при слишком большом файле
  // и при сбое шифрования загрузка отменяется. getDeviceList без forceRefresh: кэш актуален благодаря PEP-push
  // (crypto/omemo/device-list-discovery.js:_applyPushedDeviceList, +notify caps в net/presence/caps.js) -
  // без round-trip перед каждой загрузкой.
  if(!omemo.ready){ notifyNotSent('omemo-unavailable'); return; }
  if(!(await omemo.getDeviceList(targetJid)).length){ notifyNotSent('no-devices'); return; }
  if(file.size > uploadEncrypt.MAX_E2E_ENCRYPT_BYTES){
    toast(t('upload.tooLargeForE2E', {size: Math.round(uploadEncrypt.MAX_E2E_ENCRYPT_BYTES/1024/1024)}));
    return;
  }

  // Превью-кадр видео (net/media/thumb-codec.js - как едет со ссылкой; net/upload/video-thumb.js,
  // features/video-note/recording-stop.js - как добывается). Для кружка opts.thumbnailB64url уже готов
  // (кадр с канваса записи, features/video-note/preview.js); для видео из галереи считаем здесь
  // ПАРАЛЛЕЛЬНО со слотом/шифрованием/аплоадом - декодирование кадра обычно быстрее загрузки.
  const kind = kindOfFile(file);
  const thumbPromise = opts.thumbnailB64url || (kind === 'video' ? captureVideoThumb(file) : null);

  const cacheKey = opts.stickerCacheId && 'stickerLink:' + opts.stickerCacheId + ':e2e';
  if(cacheKey){
    const cached = await history.getMeta(cacheKey).catch(() => null);
    if(cached?.url){
      // Стикер уже заливали с этого устройства - шлём ту же ссылку без повторной заливки.
      // Собеседник, уже открывавший его, берёт из постоянного кэша (net/media.js:decrypt/media-cache)
      // без обращения к серверу. Риск: если файл удалён с upload-сервиса по сроку хранения,
      // ссылка перестанет открываться - тогда стикер зальётся заново, когда cacheKey не найдётся.
      const linkToSend = uploadEncrypt.buildAesgcmLink(cached.url, cached.aesKeyIvHex);
      media.primeLocalBlob(linkToSend, file);
      await _deliver(targetJid, replyTo, linkToSend, file);
      return;
    }
  }

  let slot;
  try{
    slot = await requestSlot({
      filename: file.name,
      declaredSize: uploadEncrypt.encryptedSize(file),
      contentType: 'application/octet-stream',
    });
  }catch(err){
    toast(err.reason);
    return;
  }

  // ---- XEP-0454 (OMEMO Media Sharing): файл шифруется всегда ----
  const enc = await uploadEncrypt.encryptFile(file);
  if(!enc){ toast(t('upload.encryptFailed')); return; }

  uploadProgress.show(contactName(targetJid) + ': ' + (queueLabel ? queueLabel + ' ' : '') + file.name);

  const {ok} = await putFile({putUrl: slot.putUrl, headers: slot.headers, blob: enc.blob, putHost: slot.putHost});
  if(!ok) return;

  if(cacheKey){
    history.setMeta(cacheKey, {url: slot.getUrl, aesKeyIvHex: enc.keyIvHex}).catch(e => history.reportWriteError(e, t('history.ctxStickerLink')));
  }

  let linkToSend = uploadEncrypt.buildAesgcmLink(slot.getUrl, enc.keyIvHex);
  // Превью встраивается в aesgcm-ссылку: только такая рендерится плеером с постером
  // (ui/chat-view/message-body-html.js, bubble-renderers.js).
  const thumbB64url = await thumbPromise;
  if(thumbB64url) linkToSend = appendThumbToLink(linkToSend, thumbB64url);
  if(kind === 'file'){
    linkToSend += (linkToSend.includes('#') ? ';' : '#') + fileNameFragment(file.name);
  }
  // Plaintext `file` у нас на руках - кладём в кэш медиа под той же ссылкой, что уйдёт в сообщение,
  // иначе chat-view/render-messages.js скачивал бы и расшифровывал только что загруженный файл.
  media.primeLocalBlob(linkToSend, file);
  await _deliver(targetJid, replyTo, linkToSend, file);
}
