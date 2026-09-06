// ============= features/stickers/storage/db.js =============
// Подключение к IndexedDB стикер-паков и общие обёртки над
// IDBRequest/IDBTransaction в виде промисов.
import { openIndexedDb } from '../../../core/storage.js';
import { t } from '../../../i18n/t.js';

const DB_NAME = 'riedchat-stickers';
const DB_VERSION = 1;

let dbPromise = null;
export function db(){
  if(!dbPromise){
    dbPromise = openIndexedDb(DB_NAME, DB_VERSION, {
      timeoutMessage: t('stickers.dbTimeout'),
      onUpgrade(d){
        if(!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', {keyPath: 'id'});
        if(!d.objectStoreNames.contains('stickers')){
          const s = d.createObjectStore('stickers', {keyPath: 'id'});
          s.createIndex('packId', 'packId', {unique: false});
        }
      },
    });
  }
  return dbPromise;
}

export function reqToPromise(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx){
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(t('stickers.txAborted')));
  });
}
