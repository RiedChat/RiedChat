// ===================== net/media-cache-shared.js =====================
// Чтение/запись/вытеснение постоянного кэша расшифрованных медиа в IndexedDB
// (store 'mediaCache', схема - net/history/schema.js). Работает в двух контекстах:
// главный поток (через net/history.js) и net/media-worker/media-worker.js (свой экземпляр модуля).
//
// `key` - AES-GCM CryptoKey (главный поток -
// crypto/omemo-vault.js:getHistoryStorageKey; воркер - получен через postMessage,
// см. net/media/worker-client.js).
import { reqToPromise, txDone, isQuotaError } from '../core/idb.js';
import * as bytes from '../crypto/bytes.js';

const MEDIA_CACHE_MAX_BYTES = 300 * 1024 * 1024;  // 300 МБ на аккаунт - верхняя граница
const MEDIA_CACHE_QUOTA_SHARE = 0.4;  // не больше 40% квоты источника (остальное - история, стикеры, OMEMO)

// Лимит: min(300 МБ, 40% квоты браузера) - при малой квоте 300 МБ забивали хранилище,
// и браузер сносил весь источник.
async function mediaCacheLimit(){
  const quota = (await navigator.storage?.estimate?.().catch(() => null))?.quota;
  return quota
    ? Math.min(MEDIA_CACHE_MAX_BYTES, Math.floor(quota * MEDIA_CACHE_QUOTA_SHARE))
    : MEDIA_CACHE_MAX_BYTES;
}

// Запись: {iv, data (зашифровано), kind, size, ts}. ts обновляется при чтении - вытеснение (evictMediaCache)
// по последнему обращению. kind/size не шифруются: нужны для LRU и UI-заглушек без crypto.subtle
// на каждую запись и не раскрывают содержимое.
export async function getMediaEntry(db, url, key){
  const store = db.transaction('mediaCache', 'readwrite').objectStore('mediaCache');
  const rec = await reqToPromise(store.get(url));
  if(!rec) return null;
  rec.ts = Date.now();  // «прикоснулись» - двигаем в конец очереди на вытеснение
  store.put(rec, url);
  const plain = await bytes.aesGcmDecrypt(key, rec.iv, rec.data);
  return { blob: new Blob([plain], { type: rec.kind || '' }), kind: rec.kind };
}

// Только наличие записи: без чтения/расшифровки и без сдвига ts. Нужно
// ui/chat-view/media-loader/defer-until-tap.js, чтобы решить: плашка "нажмите, чтобы загрузить" или сразу дозагрузка.
export async function hasMediaEntry(db, url){
  const found = await reqToPromise(db.transaction('mediaCache', 'readonly').objectStore('mediaCache').getKey(url));
  return found !== undefined;
}

export async function putMediaEntry(db, url, blob, kind, key){
  const enc = await bytes.aesGcmEncrypt(key, await blob.arrayBuffer());
  const write = () => {
    const tx = db.transaction('mediaCache', 'readwrite');
    tx.objectStore('mediaCache').put({ iv: enc.iv, data: enc.data, kind, size: blob.size, ts: Date.now() }, url);
    return txDone(tx);
  };
  try{
    await write();
  }catch(e){
    // Кэш best-effort: квоту наверх не пробрасываем - освобождаем место, пробуем один раз,
    // не вышло - не кэшируем. Место нужно переписке и стикерам.
    if(!isQuotaError(e)) throw e;
    try{ await evictMediaCache(db, 0.5); await write(); }catch{}
  }
}

// Вытесняет самые давно использованные записи, пока размер не уложится в лимит.
// Вызывается в фоне после записи; работает по метаданным (size/ts).
// shrinkTo (0..1) - вытеснять до shrinkTo * лимита (при нехватке места).
export async function evictMediaCache(db, shrinkTo = 1){
  const limit = Math.floor((await mediaCacheLimit()) * shrinkTo);
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
    } else if(total > limit){
      entries.sort((a, b) => a.ts - b.ts);  // старые (давно не использованные) - первыми
      let over = total - limit;
      for(const e of entries){
        if(over <= 0) break;
        store.delete(e.key);
        over -= e.size;
      }
    }
  };
  return txDone(tx);
}

export function clearMediaCache(db){
  const tx = db.transaction('mediaCache', 'readwrite');
  tx.objectStore('mediaCache').clear();
  return txDone(tx);
}
