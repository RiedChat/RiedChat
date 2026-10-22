// ===================== core/image-utils.js =====================
// Утилиты файлов-изображений: сжатие в JPEG и чтение как есть (net/vcard.js, features/wallpaper/modal.js).
import { t } from '../i18n/t.js';

// Новый <canvas> заданного размера (getContext вызывает сам вызывающий: 2d, captureStream и т.д.).
export function makeCanvas(w, h){
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// Сжимает картинку до небольшого JPEG: аватар показывается ~40-80px, а раздутую vCard сервер может отклонить.
export async function resizeImageToJpegDataUrl(file, maxSide, quality = 0.85){
  let bitmap;
  try{ bitmap = await createImageBitmap(file); }
  catch{ throw new Error(t('common.imageDecodeFailed')); }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale))
  );
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

// Читает файл как data URL без перекодирования: canvas убивает анимацию, а нужно для GIF-обоев.
export function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('common.fileReadFailed')));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// data URL из base64 и MIME-типа (по умолчанию JPEG).
export const dataUrlOf = (b64, type) => `data:${type || 'image/jpeg'};base64,${b64}`;
