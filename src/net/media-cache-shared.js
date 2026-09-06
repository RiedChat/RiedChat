// ===================== net/media-cache-shared.js =====================
// Общая логика чтения/записи/вытеснения постоянного кэша расшифрованных
// медиа (фото/видео/голосовые) в IndexedDB (object store 'mediaCache' -
// схема см. net/history/db.js). Используется из двух разных контекстов
// исполнения:
//   - главный поток вкладки - через net/history/media-cache.js
//   - net/media-worker/media-worker.js - отдельный module Worker
// Обычный ES-модуль: в главном потоке импортируется как часть общего
// бандла, в воркере - как отдельный чанк (свой экземпляр модуля,
// собственная память, общих переменных между потоками нет и не нужно).

export const MEDIA_CACHE_MAX_BYTES = 300 * 1024 * 1024; // 300 МБ на аккаунт

// Запись: {blob, kind, ts} - ts обновляется при каждом чтении, чтобы
// вытеснение (evictMediaCache) убирало действительно самое давнее по
// последнему обращению, а не самое давно добавленное.
export function getMediaEntry(db, url){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    const store = tx.objectStore('mediaCache');
    const req = store.get(url);
    req.onsuccess = () => {
      const rec = req.result;
      if(rec){
        rec.ts = Date.now(); // «прикоснулись» - двигаем в конец очереди на вытеснение
        store.put(rec, url);
      }
      resolve(rec || null);
    };
    req.onerror = () => reject(req.error);
  });
}

export function putMediaEntry(db, url, blob, kind){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    tx.objectStore('mediaCache').put({blob, kind, size: blob.size, ts: Date.now()}, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Вытесняет самые давно использованные записи, пока суммарный размер
// не уложится в лимит. Вызывается в фоне после каждой записи - не блокирует рендер.
export function evictMediaCache(db){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    const store = tx.objectStore('mediaCache');
    const req = store.openCursor();
    const entries = [];
    let total = 0;
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if(cur){
        entries.push({key: cur.primaryKey, size: cur.value.size || 0, ts: cur.value.ts || 0});
        total += cur.value.size || 0;
        cur.continue();
      } else {
        if(total > MEDIA_CACHE_MAX_BYTES){
          entries.sort((a, b) => a.ts - b.ts); // старые (давно не использованные) - первыми
          let over = total - MEDIA_CACHE_MAX_BYTES;
          for(const e of entries){
            if(over <= 0) break;
            store.delete(e.key);
            over -= e.size;
          }
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearMediaCache(db){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    tx.objectStore('mediaCache').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
