// ===================== net/history/threads.js =====================
// Хранение и чтение переписки (state.messages) в object store 'threads',
// и служебных данных (например, id последнего синхронизированного через MAM
// сообщения) в 'meta'. Схема и открытие базы - см. net/history/db.js.
//
// Значения обоих store'ов шифруются AES-GCM data-key'ом истории (`key` -
// см. crypto/omemo-vault.js:getHistoryStorageKey, передаётся из
// net/history.js) - раньше текст переписки лежал в IndexedDB открытым
// текстом, в отличие от OMEMO-ключей/учётки, которые уже шифровались
// vault'ом. Ключи record'ов (jid/meta-имя) остаются как есть - по ним
// работает cursor в loadAll(), сами по себе они не секрет.
import { encryptOmemoValue, decryptOmemoValue } from '../../crypto/omemo-vault.js';
import { debugLog } from '../../core/debug-log.js';

// Легаси-запись (до введения шифрования истории) - обычный JS-объект/массив
// напрямую, без обёртки {v:1, iv, data}. Отдаём как есть (тот же приём, что
// и crypto/idb-kv.js:EncryptedIdbKv для OMEMO-хранилища) - следующий
// saveThread/setMeta для этого же ключа перезапишет её уже в зашифрованном виде.
function isEncryptedRecord(v){
  return v && typeof v === 'object' && v.v === 1 && typeof v.iv === 'string' && typeof v.data === 'string';
}

// Возвращает {jid: [сообщения...]} - весь сохранённый на этом устройстве архив.
export function loadAll(db, key){
  return new Promise((resolve, reject) => {
    if(!db){ resolve({}); return; }
    const out = [];
    const tx = db.transaction('threads', 'readonly');
    const req = tx.objectStore('threads').openCursor();
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if(cur){
        out.push([cur.key, cur.value]);
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  }).then(async (pairs) => {
    const result = {};
    for(const [jid, val] of pairs){
      if(!isEncryptedRecord(val)){
        result[jid] = val;
        continue;
      }
      try{
        result[jid] = await decryptOmemoValue(key, val);
      }catch(e){
        debugLog('[history] не удалось расшифровать тред "' + jid + '": ' + (e && e.message ? e.message : e));
        result[jid] = [];
      }
    }
    return result;
  });
}

// Перезаписывает весь массив сообщений для конкретного jid (fire-and-forget со стороны вызывающего).
export async function saveThread(db, jid, messages, key){
  if(!db) return;
  const blob = await encryptOmemoValue(key, messages);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').put(blob, jid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearThread(db, jid){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').delete(jid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearAll(db){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- служебные данные (например, id последнего синхронизированного через MAM сообщения) ----
export function getMeta(db, key, cryptoKey){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(null); return; }
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
    req.onerror = () => reject(req.error);
  }).then(async (val) => {
    if(!isEncryptedRecord(val)) return val;
    try{
      return await decryptOmemoValue(cryptoKey, val);
    }catch(e){
      debugLog('[history] не удалось расшифровать meta "' + key + '": ' + (e && e.message ? e.message : e));
      return null;
    }
  });
}

export async function setMeta(db, key, val, cryptoKey){
  if(!db) return;
  const blob = await encryptOmemoValue(cryptoKey, val);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
