// ===================== features/stickers/share.js =====================
// Шаринг пака: все стикеры пака в один JSON (name + stickers[{name, type, b64}]), отправка вложением (net/upload.js).
// Имя файла всегда "stickers.json" - маркер пака (net/media/mime-kind.js:isStickerPack, pack-card.js).
import { b64FromBuf } from '../../crypto/bytes.js';
import { t } from '../../i18n/t.js';

import { listStickers } from './storage/stickers.js';

export async function buildStickerPackFile(pack, stickersOverride){
  const stickers = stickersOverride || await listStickers(pack.id);
  if(!stickers.length) throw new Error(t('stickers.nothingToSend'));
  const data = {
    name: String(pack.name || t('stickers.defaultPackName')).trim() || t('stickers.defaultPackName'),
    stickers: await Promise.all(stickers.map(async (s, i) => ({
      name: s.name || ('sticker-' + i),
      type: s.blob.type,
      b64: b64FromBuf(await s.blob.arrayBuffer()),
    }))),
  };
  return new File([JSON.stringify(data)], 'stickers.json', { type: 'application/json' });
}
