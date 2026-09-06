// ===================== net/media-worker/media-worker.js =====================
// Вынесенные из media.js в отдельный Worker: скачивание зашифрованного
// (aesgcm://, XEP-0454) файла, его расшифровка AES-256-GCM и запись/чтение
// постоянного кэша в IndexedDB (та же база и то же хранилище 'mediaCache',
// что использует net/history.js на главном потоке).
//
// ЗАЧЕМ: раньше весь этот путь (fetch + сборка ArrayBuffer + IndexedDB.put)
// выполнялся в главном потоке вкладки. Для больших файлов (видео) запись
// blob'а в IndexedDB - синхронная операция, которая на время блокирует
// вкладку: WebSocket-фреймы не обрабатываются вовремя, и исходящие
// сообщения зависают в очереди, пока блокировка не пройдёт. Раньше это
// "лечили" тем, что в постоянный кэш вообще не писали файлы крупнее 25 МБ -
// но тогда видео просто никогда не кэшировались и перекачивались заново
// при каждом открытии чата.
//
// Здесь весь этот код выполняется в собственном потоке воркера - что бы
// внутри ни происходило (сеть, crypto.subtle, IndexedDB), на обработку
// WebSocket-фреймов и отправку сообщений в главном потоке это не влияет.
// Поэтому лимит на размер можно снять: см. media.js (там его больше нет).
//
// Module Worker: инстанцируется из net/media/worker-client.js через
// `new Worker(new URL('../media-worker/media-worker.js', import.meta.url), { type: 'module' })`.
// Vite видит этот паттерн и бандлит воркер вместе со всеми его import'ами
// (mime.js, fetch-decrypt.js, media-cache-shared.js) в один отдельный
// минифицированный чанк - отдельно от главного бандла (свой поток
// исполнения), но так же проходя через сборщик.
import { getMediaEntry, putMediaEntry, evictMediaCache } from '../media-cache-shared.js';
import { fetchAndDecrypt } from './fetch-decrypt.js';

// ---- IndexedDB: та же база/версия/схема, что и net/history/db.js ----
let dbPromise = null;
let openedDbName = null;

function openDb(dbName){
  if(dbPromise && openedDbName === dbName) return dbPromise;
  openedDbName = dbName;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains('threads')) db.createObjectStore('threads');
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('mediaCache')) db.createObjectStore('mediaCache');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // onblocked здесь не страшен: если апгрейд ведёт вкладка, воркер просто
    // подождёт своей открытой копии базы - сообщение всё равно рано или
    // поздно обработается, а на отправку сообщений в главном потоке это
    // никак не влияет (мы в отдельном потоке).
  });
  return dbPromise;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const { type, reqId, dbName } = msg;

  try{
    if(type === 'decrypt'){
      const db = await openDb(dbName);
      const cached = await getMediaEntry(db, msg.url);
      if(cached && cached.blob){
        self.postMessage({ type:'result', reqId, ok:true, blob: cached.blob, kind: cached.kind, fromCache: true });
        return;
      }
      const { blob, kind } = await fetchAndDecrypt(msg.url, (pct) => {
        self.postMessage({ type:'progress', reqId, pct });
      }, msg.allowedHosts, msg.senderDomain);
      self.postMessage({ type:'result', reqId, ok:true, blob, kind, fromCache: false });
      // Пишем в постоянный кэш и чистим лишнее уже ПОСЛЕ ответа - это не
      // задерживает показ файла пользователю, и, поскольку мы в воркере,
      // никак не сказывается на отправке сообщений в главном потоке.
      try{
        await putMediaEntry(db, msg.url, blob, kind);
        await evictMediaCache(db);
      }catch(e){
        self.postMessage({ type:'cache-write-error', reqId, error: (e && e.message) || String(e) });
      }
      return;
    }

    if(type === 'store'){
      // Используется для собственных отправленных файлов (primeLocalBlob в media.js):
      // главный поток уже показал их пользователю локально, здесь только
      // фоново сохраняем в постоянный кэш.
      const db = await openDb(dbName);
      await putMediaEntry(db, msg.url, msg.blob, msg.kind);
      await evictMediaCache(db);
      self.postMessage({ type:'stored', reqId, ok:true });
      return;
    }
  }catch(e){
    self.postMessage({ type:'result', reqId, ok:false, error: (e && e.message) || String(e) });
  }
};
