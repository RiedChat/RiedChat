// ===================== net/media/worker-client.js =====================
// Обёртка над Web Worker'ом net/media-worker/media-worker.js (скачивание, расшифровка, кэш в IndexedDB):
// создание, роутинг сообщений по reqId, счётчик запросов. Логика decrypt/primeLocalBlob - в net/media.js.
import { debugLog, errMsg } from '../../core/debug-log.js';

let worker = null;
let reqCounter = 0;
const pending = new Map();  // reqId -> {resolve, onProgress}

function getWorker(){
  if(!worker){
    // Vite бандлит воркер из `new Worker(new URL(...), {type:'module'})` с его импортами в отдельный чанк.
    worker = new Worker(new URL('../media-worker/media-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      const p = pending.get(msg.reqId);
      if(!p) return;
      if(msg.type === 'progress'){
        if(typeof msg.pct === 'number') p.onProgress?.(msg.pct);
        return;
      }
      if(msg.type === 'cache-write-error'){
        // Файл уже показан - только лог.
        debugLog('[media] воркер не смог записать постоянный кэш: ' + msg.error);
        return;
      }
      if(msg.type === 'result' || msg.type === 'stored'){
        pending.delete(msg.reqId);
        p.resolve(msg);
      }
    };
    worker.onerror = (e) => {
      debugLog('[media] ошибка воркера: ' + errMsg(e));
    };
  }
  return worker;
}

// Вызывается из net/history.js:init() после получения AES-GCM ключа истории/кэша
// (crypto/omemo-vault.js:getHistoryStorageKey). Воркер не имеет доступа к DOM/vault, поэтому
// CryptoKey (структурно клонируемый, не раскрывается как сырые байты) передаётся один раз через postMessage.
export function sendCacheKeyToWorker(key){
  getWorker().postMessage({ type: 'set-cache-key', key });
}

export function request(payload, onProgress){
  const reqId = 'r' + (++reqCounter);
  return new Promise((resolve) => {
    pending.set(reqId, { resolve, onProgress });
    try{ getWorker().postMessage({ reqId, ...payload }); }
    catch(e){ pending.delete(reqId); throw e; }
  });
}
