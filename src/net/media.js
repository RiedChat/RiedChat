// Расшифровка файлов XEP-0454 (OMEMO Media Sharing).
// Клиент грузит файл через HTTP Upload (XEP-0363) зашифрованным одноразовым AES-256-GCM ключом,
// в сообщении передаёт ссылку
//   aesgcm://host:port/path#<hex(iv)><hex(key)>
// Файл качаем по https:// (замена схемы) и расшифровываем в браузере.
//
// Скачивание, расшифровка и запись в кэш выполняются в Worker'е (net/media-worker/media-worker.js,
// через net/media/worker-client.js). Определение типа файла - net/media/mime-kind.js.
// Здесь: in-memory кэш и логика (primeLocalBlob/decrypt).
import { attempt } from '../core/debug-log.js';
import { state } from '../core/state.js';

import { history } from './history.js';
import { kindOfFile } from './media/mime-kind.js';
import { request } from './media/worker-client.js';

// Кэш в памяти вкладки: не расшифровывать ссылку повторно при каждом рендере.
const cache = new Map();  // aesgcmUrl -> {status:'loading'|'done'|'error', blobUrl, kind, promise, progressListeners}

export const media = {
  getCached(url){ return cache.get(url); },

  // Вызывается сразу после отправки своего файла (upload.js), пока есть оригинальный File:
  // не качаем и не расшифровываем его заново при рендере, нет "⏳ загрузка медиа…".
  primeLocalBlob(url, file){
    if(!url || !file) return;
    try{
      const kind = kindOfFile(file);
      const blobUrl = URL.createObjectURL(file);
      cache.set(url, { status:'done', blobUrl, kind, progressListeners: [] });

      // Фоновая запись в кэш через воркер - размер не важен.
      if(history.dbName){
        attempt('media', 'не удалось отправить файл в воркер для кэширования', () =>
          request({ type:'store', url, blob: file, kind, dbName: history.dbName }));
      }
    }catch(e){
      console.warn('media: не удалось закэшировать локально отправленный файл', e);
    }
  },

  // senderJid - bareJid отправителя (для своего файла - undefined/наш, хватает allowedHosts).
  // Нужен для доверия upload-хосту собеседника (TOFU, как identity-ключи OMEMO);
  // см. net/media-worker/fetch-decrypt.js.
  async decrypt(aesgcmUrl, onProgress, senderJid){
    const cached = cache.get(aesgcmUrl);
    if(cached){
      if(cached.status !== 'loading') return cached;
      if(onProgress) cached.progressListeners.push(onProgress);
      return cached.promise;
    }
    const entry = { status:'loading', progressListeners: onProgress ? [onProgress] : [] };
    cache.set(aesgcmUrl, entry);
    const promise = (async () => {
      try{
        const dbName = history.dbName;
        // Воркер не видит мутаций state (uploadComponentJid/trustedUploadHosts) - allowlist передаём
        // с каждым запросом.
        const allowedHosts = state.trustedUploadHosts.slice();
        // Strophe.getDomainFromJid есть только в главном потоке - домен считаем здесь.
        let senderDomain = null;
        // Невалидный JID не должен рвать расшифровку: senderDomain лишь уточняет allowlist, при ошибке null.
        try{ senderDomain = senderJid ? Strophe.getDomainFromJid(senderJid) : null; }catch{}
        const msg = await request(
          { type:'decrypt', url: aesgcmUrl, dbName, allowedHosts, senderDomain },
          // Слушатель - чужой код (UI мог размонтироваться); его исключение не должно прерывать decrypt.
          (pct) => entry.progressListeners.forEach(fn => { try{ fn(pct); }catch{} })
        );
        if(!msg.ok) throw new Error(msg.error || 'не удалось расшифровать медиа');

        entry.status = 'done';
        entry.blobUrl = URL.createObjectURL(msg.blob);
        entry.kind = msg.kind;
        return entry;
      }catch(e){
        console.error('aesgcm: ошибка расшифровки медиа', aesgcmUrl, e);
        entry.status = 'error';
        entry.error = e;
        return entry;
      }
    })();
    entry.promise = promise;
    return promise;
  }
};
