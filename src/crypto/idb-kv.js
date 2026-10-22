// ===================== crypto/idb-kv.js =====================
// Key-value обёртка над одним IndexedDB object store ('kv'), без знания про Signal/OMEMO.
import { reqToPromise, txDone } from '../core/idb.js';
import { openIndexedDb } from '../core/storage.js';
import { t } from '../i18n/t.js';

import { encryptOmemoValue, decryptOmemoValue } from './omemo-vault.js';

export function openOmemoDb(dbName){
  // См. openIndexedDb в core/storage.js: защита от зависания, если другая вкладка держит соединение.
  return openIndexedDb(dbName, 1, {
    timeoutMessage: t('omemo.dbTimeout'),
    label: '[omemo-store]',
    lockedMessage: t('omemo.dbLocked'),
    onUpgrade: (db) => { db.createObjectStore('kv'); },
  });
}

// Пары [key, value] по префиксу (логи, очередь pendingSlotKey); через kv.get,
// чтобы EncryptedIdbKv расшифровывал.

export class IdbKv{
  constructor(db){ this.db = db; }
  async get(key){
    return (await reqToPromise(this.db.transaction('kv', 'readonly').objectStore('kv').get(key))) ?? null;
  }
  async #write(fn){
    const tx = this.db.transaction('kv', 'readwrite');
    fn(tx.objectStore('kv'));
    await txDone(tx);
  }
  set(key, val){ return this.#write(os => os.put(val, key)); }
  del(key){ return this.#write(os => os.delete(key)); }
  async keys(prefix){
    const range = prefix ? IDBKeyRange.bound(prefix, prefix + '\uffff') : undefined;
    return reqToPromise(this.db.transaction('kv', 'readonly').objectStore('kv').getAllKeys(range));
  }
}

// Обёртка над IdbKv: шифрует value AES-GCM data-key'ом из omemo-vault.js.
// Имена записей остаются открытыми для префиксного поиска.
export class EncryptedIdbKv{
  constructor(raw, key){
    this.raw = raw;
    this.key = key;
  }
  async get(key){
    const blob = await this.raw.get(key);
    return blob === null ? null : decryptOmemoValue(this.key, blob);
  }
  async set(key, val){
    return this.raw.set(key, await encryptOmemoValue(this.key, val));
  }
  del(key){ return this.raw.del(key); }
  keys(prefix){ return this.raw.keys(prefix); }
  async entries(prefix){
    return Promise.all((await this.keys(prefix)).map(async k => [k, await this.get(k)]));
  }
}
