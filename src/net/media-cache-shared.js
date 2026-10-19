// ===================== net/media-cache-shared.js =====================
// Общая логика чтения/записи/вытеснения постоянного кэша расшифрованных
// медиа (фото/видео/голосовые) в IndexedDB (object store 'mediaCache' -
// схема см. net/history/db.js). Используется из двух разных контекстов
// исполнения:
//   - главный поток вкладки - через net/history/media-cache.js
//   - net/media-worker/media-worker.js - отдельный module Worker, свой
//     экземпляр модуля, собственная память, общих переменных между потоками
//     нет и не нужно.
//
// `key` - AES-GCM CryptoKey из net/media-cache-crypto.js (в главном потоке -
// crypto/omemo-vault.js:getHistoryStorageKey, в воркере - полученный один
// раз через postMessage, см. net/media/worker-client.js).
import { encryptCacheEntry, decryptCacheEntry } from './media-cache-crypto.js';

export const MEDIA_CACHE_MAX_BYTES = 300 * 1024 * 1024; // 300 МБ на аккаунт - верхняя граница
const MEDIA_CACHE_QUOTA_SHARE = 0.4; // не больше 40% квоты источника (остальное - история, стикеры, OMEMO)

// Реальный лимит: min(300 МБ, 40% квоты браузера). На устройствах с малой
// квотой фиксированные 300 МБ забивали хранилище целиком, и браузер
// сносил весь источник (историю и стикеры вместе с кэшем).
async function mediaCacheLimit(){
  try{
    if(typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate){
      const { quota } = await navigator.storage.estimate();
      if(quota) return Math.min(MEDIA_CACHE_MAX_BYTES, Math.floor(quota * MEDIA_CACHE_QUOTA_SHARE));
    }
  }catch(e){}
  return MEDIA_CACHE_MAX_BYTES;
}

function isQuota(e){
  return !!e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
}

// Запись на диске: {iv, data (зашифрованное содержимое), kind, size, ts} -
// ts обновляется при каждом чтении, чтобы вытеснение (evictMediaCache)
// убирало действительно самое давнее по последнему обращению, а не самое
// давно добавленное. kind/size намеренно НЕ шифруются - они нужны для
// LRU-вытеснения и UI-заглушек без похода к crypto.subtle на каждую запись
// в списке, и сами по себе не являются секретом уровня содержимого файла.
export function getMediaEntry(db, url, key){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    const store = tx.objectStore('mediaCache');
    const req = store.get(url);
    req.onsuccess = () => {
      const rec = req.result;
      if(!rec){ resolve(null); return; }
      rec.ts = Date.now(); // «прикоснулись» - двигаем в конец очереди на вытеснение
      store.put(rec, url);
      // Legacy-запись до введения шифрования кэша - хранила blob открытым
      // текстом напрямую под ключом 'blob'. Отдаём как есть; следующий
      // putMediaEntry для этого же url (обычный путь обновления кэша)
      // перезапишет её уже в зашифрованном виде.
      if(rec.blob){ resolve({ blob: rec.blob, kind: rec.kind }); return; }
      decryptCacheEntry(key, rec)
        .then(blob => resolve({ blob, kind: rec.kind }))
        .catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

// Только факт наличия записи, без чтения/расшифровки содержимого и без
// сдвига ts (это не "обращение" к файлу, а служебная проверка) - см.
// ui/chat-view/media-loader.js, которому нужно только решить, показывать ли
// плашку "нажмите, чтобы загрузить" или сразу дозагрузить уже скачанное.
export function hasMediaEntry(db, url){
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readonly');
    const req = tx.objectStore('mediaCache').getKey(url);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putMediaEntry(db, url, blob, kind, key){
  const enc = await encryptCacheEntry(key, blob);
  const write = () => new Promise((resolve, reject) => {
    const tx = db.transaction('mediaCache', 'readwrite');
    tx.objectStore('mediaCache').put({ iv: enc.iv, data: enc.data, kind, size: blob.size, ts: Date.now() }, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
  try{
    await write();
  }catch(e){
    // Кэш медиа - best-effort и восстанавливаем (перекачаем). Квоту не
    // пробрасываем наверх: освобождаем место и пробуем один раз; не вышло -
    // просто не кэшируем. Место нужно переписке и стикерам, не кэшу.
    if(!isQuota(e)) throw e;
    try{ await evictMediaCache(db, 0.5); await write(); }catch(e2){}
  }
}

// Вытесняет самые давно использованные записи, пока суммарный размер
// не уложится в лимит. Вызывается в фоне после каждой записи - не блокирует рендер.
// Работает только с метаданными (size/ts), расшифровка не нужна.
// shrinkTo (0..1) - необязательный коэффициент: вытеснять, пока кэш не
// станет меньше shrinkTo * лимита (используется при нехватке места).
export async function evictMediaCache(db, shrinkTo){
  const limit = Math.floor((await mediaCacheLimit()) * (shrinkTo || 1));
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
        if(total > limit){
          entries.sort((a, b) => a.ts - b.ts); // старые (давно не использованные) - первыми
          let over = total - limit;
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
