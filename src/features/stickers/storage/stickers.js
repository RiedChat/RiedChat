// =========== features/stickers/storage/stickers.js ===========
// CRUD над object store 'stickers' - {id, packId, blob, mime, name, ts}.
import { isQuotaError, reqToPromise, txDone } from '../../../core/idb.js';
import { t } from '../../../i18n/t.js';

import { openTx, getOne, write } from './db.js';
import { stickerKindOf, MAX_STICKER_BYTES } from './types.js';

export async function listStickers(packId){
  const { os } = await openTx('stickers', 'readonly');
  const idx = os.index('packId');
  const all = await reqToPromise(idx.getAll(IDBKeyRange.only(packId)));
  return all.sort((a, b) => a.ts - b.ts);
}

export const getSticker = (id) => getOne('stickers', id);

export async function addSticker(packId, file){
  const kind = stickerKindOf(file);
  if(!kind) throw new Error(t('stickers.unsupportedFormat'));
  if(file.size > MAX_STICKER_BYTES) throw new Error(t('stickers.tooLarge'));
  const sticker = {
    id: crypto.randomUUID(), packId, blob: file, mime: file.type || ('image/' + kind),
    name: file.name || ('sticker.' + kind), ts: Date.now(),
  };
  const { tx, os } = await openTx('stickers', 'readwrite');
  os.put(sticker);
  try{
    await txDone(tx);
  }catch(e){
    if(isQuotaError(e)) throw new Error(t('history.noSpace'), { cause: e });
    throw e;
  }
  return sticker;
}

export const deleteSticker = (id) => write('stickers', os => os.delete(id));
