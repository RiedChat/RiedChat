// ============ features/stickers/storage/packs.js ============
// CRUD над object store 'packs' - {id, name, ts}.
import { uuid } from '../../../core/uuid.js';
import { db, reqToPromise, txDone } from './db.js';
import { t } from '../../../i18n/t.js';

export async function listPacks(){
  const conn = await db();
  const tx = conn.transaction('packs', 'readonly');
  const all = await reqToPromise(tx.objectStore('packs').getAll());
  return all.sort((a, b) => a.ts - b.ts);
}

export async function createPack(name){
  const conn = await db();
  const pack = { id: uuid(), name: (name || '').trim() || t('stickers.defaultPackName'), ts: Date.now() };
  const tx = conn.transaction('packs', 'readwrite');
  tx.objectStore('packs').put(pack);
  await txDone(tx);
  return pack;
}

export async function renamePack(id, name){
  const conn = await db();
  const tx = conn.transaction('packs', 'readwrite');
  const store = tx.objectStore('packs');
  const pack = await reqToPromise(store.get(id));
  if(pack){
    pack.name = (name || '').trim() || pack.name;
    store.put(pack);
  }
  await txDone(tx);
}

// Удаляет пак и все стикеры внутри него одной транзакцией - чтобы после
// удаления пака не оставалось "осиротевших" стикеров без пака в базе.
export async function deletePack(id){
  const conn = await db();
  const tx = conn.transaction(['packs', 'stickers'], 'readwrite');
  tx.objectStore('packs').delete(id);
  const stickersStore = tx.objectStore('stickers');
  const idx = stickersStore.index('packId');
  await new Promise((resolve, reject) => {
    const cursorReq = idx.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if(cursor){ cursor.delete(); cursor.continue(); }
      else resolve();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  await txDone(tx);
}
