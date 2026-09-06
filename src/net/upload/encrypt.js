// ===================== net/upload/encrypt.js =====================
// XEP-0454 (OMEMO Media Sharing): решение, шифровать ли вложение, и само
// AES-256-GCM шифрование. Чисто про крипто/память - ничего не знает про
// XHR/slot/очередь загрузок.
import { bytes } from '../../crypto/bytes.js';
import { debugLog } from '../../core/debug-log.js';

const GCM_TAG_LEN = 16;

// Шифрование по XEP-0454 сейчас делается не потоково: весь файл читается в
// память ОДНИМ ArrayBuffer'ом (file.arrayBuffer()), а затем в памяти же лежит
// ещё и зашифрованная копия того же размера - итого ~2x размера файла разом.
// Для видео в сотни МБ это не проблема на "чистой" вкладке, но на вкладке,
// где уже накопилось много памяти под историю/кэш медиа, это может дожать
// память до OOM/зависания, из-за чего рвётся и сам WebSocket (выглядит как
// "разрыв связи с собеседником", хотя причина не в сети). Выше этого порога
// OMEMO-шифрование вложения отключаем и грузим файл как есть - обычный Blob
// уходит в PUT потоково прямо с диска, без разового чтения в память.
const MAX_E2E_ENCRYPT_BYTES = 100 * 1024 * 1024; // 100 МБ

export const uploadEncrypt = {
  GCM_TAG_LEN,
  MAX_E2E_ENCRYPT_BYTES,

  // Решает, нужно ли шифровать конкретный файл для конкретного чата.
  decide(file, chatIsE2ECapable){
    const skippedForSize = chatIsE2ECapable && file.size > MAX_E2E_ENCRYPT_BYTES;
    const useE2E = chatIsE2ECapable && !skippedForSize;
    const declaredSize = file.size + (useE2E ? GCM_TAG_LEN : 0);
    if(skippedForSize){
      debugLog('[upload] файл ' + file.name + ' (' + file.size + ' байт) больше ' + MAX_E2E_ENCRYPT_BYTES + ' - пропускаю OMEMO-шифрование вложения, гружу как обычную https-ссылку');
    }
    return {useE2E, skippedForSize, declaredSize};
  },

  // Шифрует файл AES-256-GCM. Возвращает {blob, keyIvHex} или {blob: file,
  // keyIvHex: null} при ошибке - вызывающий код тогда молча уходит на
  // обычную https-ссылку без шифрования.
  async encryptFile(file){
    try{
      const iv = bytes.randomBytes(12); // 12 байт - рекомендованный NIST размер nonce для AES-GCM
      const rawKey = bytes.randomBytes(32); // AES-256
      const cryptoKey = await crypto.subtle.importKey('raw', rawKey, {name:'AES-GCM'}, false, ['encrypt']);
      let fileBuf = await file.arrayBuffer();
      const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, cryptoKey, fileBuf);
      fileBuf = null; // отпускаем расшифрованную копию сразу - не держим в памяти
                       // одновременно plaintext И ciphertext дольше, чем необходимо
      // Отдаём в xhr.send() сам ArrayBuffer, а не new Blob([encrypted]) - конструктор
      // Blob из ArrayBuffer делает ещё одну полную копию данных в памяти, а нам тут
      // важен каждый лишний x файла при больших вложениях.
      const keyIvHex = bytes.bytesToHex(bytes.concat(iv, rawKey));
      debugLog('[upload] файл зашифрован по XEP-0454 (AES-256-GCM), размер после шифрования: ' + encrypted.byteLength + ' байт (было ' + file.size + ')');
      return {blob: encrypted, keyIvHex};
    }catch(e){
      debugLog('[upload] не удалось зашифровать файл для XEP-0454: ' + e.message + ' - отправляю как обычную https-ссылку без шифрования');
      return {blob: file, keyIvHex: null};
    }
  },

  // Собирает aesgcm:// ссылку из обычной https get-ссылки слота.
  buildAesgcmLink(getUrl, keyIvHex){
    try{
      const u = new URL(getUrl);
      return 'aesgcm://' + u.host + u.pathname + u.search + '#' + keyIvHex;
    }catch(e){
      debugLog('[upload] не удалось собрать aesgcm-ссылку из ' + getUrl + ': ' + e.message + ' - отправляю обычную https-ссылку');
      return getUrl;
    }
  },
};

// uploadEncrypt потребляется только из net/upload.js (прямой import) -
// window.App-мост здесь больше не нужен.
