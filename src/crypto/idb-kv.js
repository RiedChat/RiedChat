// ===================== crypto/idb-kv.js =====================
// Универсальная key-value обёртка над одним IndexedDB object store'ом
// ('kv'). Ничего не знает про Signal/OMEMO - чистый транспорт для
// crypto/identity-store.js, crypto/prekey-store.js, crypto/session-store.js.
import { openIndexedDb } from '../core/storage.js';
import { toast } from '../core/dom-utils.js';
import { debugLog } from '../core/debug-log.js';
import { encryptOmemoValue, decryptOmemoValue } from './omemo-vault.js';
import { t } from '../i18n/t.js';

function openOmemoDb(dbName){
  // См. openIndexedDb в core/storage.js - общая защита от "тихого"
  // зависания, если другая вкладка держит открытым соединение к той же базе.
  return openIndexedDb(dbName, 1, {
    timeoutMessage: t('omemo.dbTimeout'),
    onBlocked(){
      debugLog('[omemo-store] indexedDB.open("' + dbName + '") заблокирован - есть другое открытое соединение к базе (другая вкладка/сессия этого чата)');
      toast(t('omemo.dbLocked'));
    },
    onUpgrade(db){
      if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    },
  });
}

export class IdbKv{
  constructor(db){ this.db = db; }
  get(key){
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  }
  set(key, val){
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  del(key){
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  keys(prefix){
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = this.db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').openCursor();
      req.onsuccess = (ev) => {
        const cur = ev.target.result;
        if(cur){
          if(!prefix || String(cur.key).startsWith(prefix)) out.push(cur.key);
          cur.continue();
        } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }
}

// Обёртка над IdbKv, прозрачно шифрующая каждое значение AES-GCM data-key'ом
// из crypto/omemo-vault.js (см. п.11 riedchat-security-plan.md - identity/
// prekey/session-ключи раньше лежали в IndexedDB открытым текстом). Ключи
// (имена записей вида 'omemo:jid:session:...') остаются как есть - по ним
// идёт префиксный поиск в keys(), и сами по себе они не секрет; шифруется
// только value. `db` проксируется как есть - store.js:deleteSignalStore
// закрывает соединение через omemo.store.idb.db.close().
export class EncryptedIdbKv{
  constructor(raw, key){
    this.raw = raw;
    this.key = key;
  }
  get db(){ return this.raw.db; }
  async get(key){
    const blob = (await this.raw.get(key)) ?? null;
    if(blob === null) return null;
    // Зашифрованная запись всегда имеет форму {v:1, iv, data} (см.
    // omemo-vault.js:encryptOmemoValue). Всё остальное - legacy-запись со
    // старой, ещё не зашифрованной версии хранилища (chat_old7 и первые
    // сборки до введения EncryptedIdbKv писали сюда обычные JS-объекты
    // открытым текстом): crypto.subtle.decrypt на таких данных падает с
    // DOMException OperationError ("ошибка инициализации ключей" в toast'е).
    // Отдаём как есть и сразу же перешифровываем на диске под текущий
    // data-key, чтобы больше не натыкаться на этот же ключ.
    if(!(blob && typeof blob === 'object' && blob.v === 1 && typeof blob.iv === 'string' && typeof blob.data === 'string')){
      debugLog('[omemo-store] найдена незашифрованная legacy-запись "' + key + '" - мигрирую в зашифрованный вид');
      try{ await this.set(key, blob); }
      catch(e){ debugLog('[omemo-store] не удалось перешифровать legacy-запись "' + key + '": ' + (e && e.message ? e.message : e)); }
      return blob;
    }
    return decryptOmemoValue(this.key, blob);
  }
  async set(key, val){
    const blob = await encryptOmemoValue(this.key, val);
    await this.raw.set(key, blob);
  }
  async del(key){
    await this.raw.del(key);
  }
  async keys(prefix){
    return this.raw.keys(prefix);
  }
}

export { openOmemoDb };
