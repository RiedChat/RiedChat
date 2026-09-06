// ===================== features/stickers/share.js =====================
// «Поделиться» паком стикеров: архивирует все стикеры текущего пака в один
// ZIP (core/zip.js - свой минимальный упаковщик без сжатия, сторонний
// пакет не нужен) и отправляет его как обычное вложение (net/upload.js).
//
// Файл на выходе всегда называется РОВНО "stickers.zip" - это и есть маркер
// "это пак стикеров, а не случайный zip" для принимающей стороны (см.
// net/media/mime-kind.js:isStickerPack и features/stickers/pack-card.js,
// которые опознают вложение по этому имени и разворачивают его в карточку
// "Добавить пак" вместо голой ссылки на файл). Поэтому имя пака в имя
// файла НЕ подставляем - оно живёт внутри архива (см. ниже).
//
// Внутри архива все стикеры лежат в одной "папке" с именем пака -
// pack-card.js берёт имя пака из первого сегмента пути первого файла в
// архиве, отдельный manifest.json не нужен.
import { listStickers } from './storage.js';
import { buildZip } from '../../core/zip.js';
import { t } from '../../i18n/t.js';

function sanitizeForZipPath(name){
  // '/' сломал бы вложенность (второй сегмент пути стал бы третьим),
  // остальное - просто чтобы не тащить в архив управляющие символы имени.
  return String(name || t('stickers.defaultPackName')).replace(/[\\/]/g, '_').trim() || t('stickers.defaultPackName');
}

export async function buildStickerPackFile(pack, stickersOverride){
  const stickers = stickersOverride || await listStickers(pack.id);
  if(!stickers.length) throw new Error(t('stickers.nothingToSend'));
  const folder = sanitizeForZipPath(pack.name);
  const entries = await Promise.all(stickers.map(async (s, i) => ({
    name: folder + '/' + String(i).padStart(3, '0') + '-' + (s.name || ('sticker-' + i)),
    data: new Uint8Array(await s.blob.arrayBuffer()),
  })));
  const blob = await buildZip(entries);
  return new File([blob], 'stickers.zip', { type: 'application/zip' });
}
