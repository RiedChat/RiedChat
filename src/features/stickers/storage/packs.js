// ============ features/stickers/storage/packs.js ============
// CRUD над object store 'packs' - {id, name, ts}.
import { reqToPromise, txDone } from '../../../core/idb.js';
import { t } from '../../../i18n/t.js';

import { openTx, getOne, write } from './db.js';

export async function listPacks(){
  const { os } = await openTx('packs', 'readonly');
  const all = await reqToPromise(os.getAll());
  return all.sort((a, b) => a.ts - b.ts);
}

export const getPack = (id) => getOne('packs', id);

export async function createPack(name){
  const pack = { id: crypto.randomUUID(), name: (name || '').trim() || t('stickers.defaultPackName'), ts: Date.now() };
  await write('packs', os => os.put(pack));
  return pack;
}

// Удаляет пак и его стикеры одной транзакцией (без осиротевших стикеров).
export async function deletePack(id){
  const { tx, os } = await openTx(['packs', 'stickers'], 'readwrite');
  const stickers = tx.objectStore('stickers');
  os.delete(id);
  const keys = await reqToPromise(stickers.index('packId').getAllKeys(IDBKeyRange.only(id)));
  keys.forEach(k => stickers.delete(k));
  await txDone(tx);
}
