// ============ features/stickers/storage/types.js ============
// Разрешённые типы стикеров и определение типа по MIME/расширению.
import { extOf } from '../../../core/text-patterns.js';

const KINDS = new Set(['png', 'webp', 'jpg', 'heic', 'gif']);
const ALIAS = { jpeg: 'jpg', heif: 'heic' };
const norm = (s) => ALIAS[s] || s;

export const MAX_STICKER_BYTES = 5 * 1024 * 1024; // 5 МБ на файл

// Тип по MIME ('image/jpeg' -> 'jpg'), иначе по расширению (часть браузеров/ОС отдаёт HEIC с пустым или generic MIME);
// null, если не png/webp/jpg/jpeg/heic/heif/gif.
export const stickerKindOf = (file) =>
  [norm((file.type || '').replace('image/', '')), norm(extOf(file.name))].find(k => KINDS.has(k)) ?? null;

// MIME по имени файла (для стикеров пака без type).
export function stickerMimeOf(name){
  const kind = stickerKindOf({ name });
  return kind ? 'image/' + (kind === 'jpg' ? 'jpeg' : kind) : 'application/octet-stream';
}
