// ===================== core/image-utils.js =====================
// Общие утилиты работы с файлами изображений: сжатие в JPEG и чтение "как
// есть". Используются в net/vcard.js (аватар профиля/контактов) и
// features/wallpaper/modal.js (обои чата).
import { t } from '../i18n/t.js';

// Сжимает выбранную пользователем картинку до небольшого JPEG (устройства
// контактов держат её только для показа круглой аватарки ~40-80px, так что
// большое разрешение не нужно, а vCard раздутого размера сервер может отклонить).
export function resizeImageToJpegDataUrl(file, maxSide, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('common.fileReadFailed')));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(t('common.imageDecodeFailed')));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try{ resolve(canvas.toDataURL('image/jpeg', quality || 0.85)); }
        catch(e){ reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Читает файл как data URL "как есть", без перекодирования через canvas -
// в отличие от resizeImageToJpegDataUrl (который рисует один кадр на canvas
// и потому "убивает" анимацию), это нужно для GIF-обоев: анимация должна
// остаться живой, а перекодировать GIF в JPEG всё равно нельзя (JPEG не
// умеет в анимацию).
export function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('common.fileReadFailed')));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
