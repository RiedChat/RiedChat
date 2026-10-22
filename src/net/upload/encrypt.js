// ===================== net/upload/encrypt.js =====================
// XEP-0454 (OMEMO Media Sharing): AES-256-GCM шифрование вложения. Только крипто/память;
// XHR/slot/очередь - в других модулях.
import { debugLog } from '../../core/debug-log.js';
import * as bytes from '../../crypto/bytes.js';

const GCM_TAG_LEN = 16;

// Шифрование не потоковое: файл целиком в памяти ArrayBuffer'ом + шифрованная копия = ~2x размера.
// При большой памяти вкладки (история/кэш) это даёт OOM/зависание и обрыв WebSocket (выглядит как
// "разрыв связи с собеседником"). Выше порога файл не отправляется (net/upload.js): без шифрования вложения не шлём.
const MAX_E2E_ENCRYPT_BYTES = 100 * 1024 * 1024;  // 100 МБ

export const uploadEncrypt = {
  MAX_E2E_ENCRYPT_BYTES,

  // Размер зашифрованного blob'а (ciphertext + GCM-тег) - для запроса слота.
  encryptedSize(file){ return file.size + GCM_TAG_LEN; },

  // Шифрует AES-256-GCM. Возвращает {blob, keyIvHex}; при ошибке null - вызывающий отменяет загрузку.
  async encryptFile(file){
    try{
      const rawKey = bytes.randomBytes(32);
      const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
      const {iv, data} = await bytes.aesGcmEncrypt(key, await file.arrayBuffer());
      return {blob: data, keyIvHex: bytes.bytesToHex(bytes.concat(iv, rawKey))};
    }catch(e){
      debugLog('[upload] не удалось зашифровать файл для XEP-0454: ' + e.message + ' - загрузка отменена');
      return null;
    }
  },

  // Собирает aesgcm:// ссылку из https get-ссылки слота.
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
