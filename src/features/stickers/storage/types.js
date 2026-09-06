// ============ features/stickers/storage/types.js ============
// Разрешённые типы стикеров и определение типа по MIME/расширению.
export const ALLOWED_STICKER_TYPES = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/gif': 'gif',
};
// Фоллбэк по расширению - некоторые браузеры/ОС отдают HEIC-файлы с пустым
// или generic ('application/octet-stream') MIME в <input type=file>.
const EXT_TO_KIND = { png:'png', webp:'webp', jpg:'jpg', jpeg:'jpg', heic:'heic', heif:'heic', gif:'gif' };

export const MAX_STICKER_BYTES = 5 * 1024 * 1024; // 5 МБ на файл - с запасом хватает даже на не самый сжатый GIF

export function extOf(name){
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

// Определяет тип стикера по MIME, а если MIME пустой/generic - по расширению
// имени файла (см. комментарий у EXT_TO_KIND выше). Возвращает null, если
// ни то ни другое не входит в разрешённый список (png/webp/jpg/jpeg/heic/gif).
export function stickerKindOf(file){
  return ALLOWED_STICKER_TYPES[file.type] || EXT_TO_KIND[extOf(file.name)] || null;
}
