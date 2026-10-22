// ===================== net/media-worker/media-worker.js =====================
// Worker: скачивание aesgcm:// (XEP-0454) файла, расшифровка AES-256-GCM и запись/чтение
// постоянного кэша в IndexedDB (та же база и store 'mediaCache', что в history.js).
//
// ЗАЧЕМ: запись больших blob'ов (видео) в IndexedDB блокирует главный поток - WebSocket-фреймы
// не обрабатываются, исходящие зависают. В воркере это не влияет на главный поток,
// поэтому лимит размера файла для кэша снят (см. media.js).
//
// Module Worker: создаётся в net/media/worker-client.js через
// `new Worker(new URL('../media-worker/media-worker.js', import.meta.url), { type: 'module' })`;
// Vite бандлит его с импортами (mime.js, fetch-decrypt.js, media-cache-shared.js) в отдельный чанк.
import { reqToPromise } from '../../core/idb.js';
import { DB_VERSION, upgradeSchema } from '../history/schema.js';
import { getMediaEntry, putMediaEntry, evictMediaCache } from '../media-cache-shared.js';

import { fetchAndDecrypt } from './fetch-decrypt.js';

// ---- IndexedDB: та же база/версия/схема, что в net/history.js ----
let dbPromise = null;
let openedDbName = null;
// CryptoKey медиа-кэша, полученный от главного потока (net/media/worker-client.js:sendCacheKeyToWorker):
// воркер не может запросить passphrase/биометрию. До его получения 'decrypt'/'store' ставятся в очередь.
let cacheKey = null;
let cacheKeyResolve;
const cacheKeyReady = new Promise(resolve => { cacheKeyResolve = resolve; });

function openDb(dbName){
  if(dbPromise && openedDbName === dbName) return dbPromise;
  openedDbName = dbName;
  // onblocked не страшен: воркер дождётся своей копии базы, главный поток не затрагивается.
  const req = indexedDB.open(dbName, DB_VERSION);
  req.onupgradeneeded = () => upgradeSchema(req.result);
  dbPromise = reqToPromise(req);
  return dbPromise;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const { type, reqId, dbName } = msg;

  if(type === 'set-cache-key'){
    cacheKey = msg.key;
    cacheKeyResolve(cacheKey);
    return;
  }

  try{
    if(type === 'decrypt'){
      const db = await openDb(dbName);
      const key = cacheKey || await cacheKeyReady;
      const cached = await getMediaEntry(db, msg.url, key);
      if(cached?.blob){
        self.postMessage({ type:'result', reqId, ok:true, blob: cached.blob, kind: cached.kind, fromCache: true });
        return;
      }
      const { blob, kind } = await fetchAndDecrypt(msg.url, (pct) => {
        self.postMessage({ type:'progress', reqId, pct });
      }, msg.allowedHosts, msg.senderDomain);
      self.postMessage({ type:'result', reqId, ok:true, blob, kind, fromCache: false });
      // Запись в кэш и чистка - ПОСЛЕ ответа: не задерживает показ файла.
      try{
        await putMediaEntry(db, msg.url, blob, kind, key);
        await evictMediaCache(db);
      }catch(e){
        self.postMessage({ type:'cache-write-error', reqId, error: e?.message || String(e) });
      }
      return;
    }

    if(type === 'store'){
      // Для своих отправленных файлов (primeLocalBlob в media.js): главный поток уже показал их
      // локально, здесь только фоновое сохранение в кэш.
      const db = await openDb(dbName);
      const key = cacheKey || await cacheKeyReady;
      await putMediaEntry(db, msg.url, msg.blob, msg.kind, key);
      await evictMediaCache(db);
      self.postMessage({ type:'stored', reqId, ok:true });
    }
  }catch(e){
    self.postMessage({ type:'result', reqId, ok:false, error: e?.message || String(e) });
  }
};
