// =========== features/stickers/storage/stickers.js ===========
// CRUD над object store 'stickers' - {id, packId, blob, mime, name, ts}.
import { uuid } from '../../../core/uuid.js';
import { db, reqToPromise, txDone } from './db.js';
import { stickerKindOf, MAX_STICKER_BYTES } from './types.js';
import { t } from '../../../i18n/t.js';

export async function listStickers(packId){
  const conn = await db();
  const tx = conn.transaction('stickers', 'readonly');
  const idx = tx.objectStore('stickers').index('packId');
  const all = await reqToPromise(idx.getAll(IDBKeyRange.only(packId)));
  return all.sort((a, b) => a.ts - b.ts);
}

export async function addSticker(packId, file){
  const kind = stickerKindOf(file);
  if(!kind) throw new Error(t('stickers.unsupportedFormat'));
  if(file.size > MAX_STICKER_BYTES) throw new Error(t('stickers.tooLarge'));
  const conn = await db();
  const sticker = {
    id: uuid(), packId, blob: file, mime: file.type || ('image/' + kind),
    name: file.name || ('sticker.' + kind), ts: Date.now(),
  };
  const tx = conn.transaction('stickers', 'readwrite');
  tx.objectStore('stickers').put(sticker);
  await txDone(tx);
  return sticker;
}

export async function deleteSticker(id){
  const conn = await db();
  const tx = conn.transaction('stickers', 'readwrite');
  tx.objectStore('stickers').delete(id);
  await txDone(tx);
}
