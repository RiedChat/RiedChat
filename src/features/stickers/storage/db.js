// ============= features/stickers/storage/db.js =============
// IndexedDB стикер-паков (не привязана к аккаунту, как шрифт в font-settings/storage.js).
// Stores: 'packs' {id, name, ts} (packs.js); 'stickers' {id, packId, blob, mime, name, ts}, индекс по packId (stickers.js).
// Типы и лимиты - types.js. Blob хранится как есть: перекодирование через canvas убило бы анимацию GIF.
import { reqToPromise, txDone } from '../../../core/idb.js';
import { openIndexedDb } from '../../../core/storage.js';
import { t } from '../../../i18n/t.js';

const DB_NAME = 'riedchat-stickers';
const DB_VERSION = 1;

let dbPromise = null;
const db = () => (dbPromise ??= openIndexedDb(DB_NAME, DB_VERSION, {
  timeoutMessage: t('stickers.dbTimeout'),
  onUpgrade(d){
    if(!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', {keyPath: 'id'});
    if(!d.objectStoreNames.contains('stickers')){
      const s = d.createObjectStore('stickers', {keyPath: 'id'});
      s.createIndex('packId', 'packId', {unique: false});
    }
  },
}));

// Транзакция над store(ами) -> {tx, os}; os - первый store из names.
export async function openTx(names, mode){
  const conn = await db();
  const tx = conn.transaction(names, mode);
  return { tx, os: tx.objectStore(Array.isArray(names) ? names[0] : names) };
}

export async function getOne(store, id){
  const { os } = await openTx(store, 'readonly');
  return (await reqToPromise(os.get(id))) || null;
}

export async function write(store, fn){
  const { tx, os } = await openTx(store, 'readwrite');
  fn(os);
  await txDone(tx);
}
