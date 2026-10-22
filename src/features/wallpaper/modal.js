// ===================== features/wallpaper/modal.js =====================
// Обои в модалке профиля: пикер файла, GIF-ветка, превью, удаление. Применение к DOM - render.js, хранение - storage.js.
import { $, toast } from '../../core/dom-utils.js';
import { readFileAsDataUrl, resizeImageToJpegDataUrl, dataUrlOf } from '../../core/image-utils.js';
import { createPendingImage, wirePendingImagePicker } from '../../core/pending-image.js';
import { t } from '../../i18n/t.js';

import { applyWallpaper } from './render.js';
import { wallpaperStore } from './storage.js';


function renderWallpaperPreview(b64, type){
  const preview = $('wallpaper-preview');
  if(!preview) return;
  preview.style.backgroundImage = b64 ? `url(${dataUrlOf(b64, type)})` : '';
  $('wallpaper-remove').hidden = !b64;
}

// Несохранённые изменения обоев; сбрасываются при каждом открытии модалки профиля.
const pending = createPendingImage({ previewFn: (b64, type) => renderWallpaperPreview(b64, type) });

// При открытии модалки: сброс pending-состояния и превью сохранённых обоев.
export function openInModal(){
  const wallpaper = wallpaperStore.get();
  pending.reset();
  renderWallpaperPreview(wallpaper && wallpaper.b64, wallpaper && wallpaper.type);
}

// GIF не гоняем через canvas.toDataURL (останется один кадр): сохраняем как есть, проверяя размер -
// localStorage ~5-10МБ на источник, base64 раздувает файл на треть.
const MAX_GIF_BYTES = 4 * 1024 * 1024;

async function processWallpaperFile(file){
  if(file.type === 'image/gif'){
    if(file.size > MAX_GIF_BYTES){
      toast(t('wallpaper.gifTooLarge'));
      return null;
    }
    return [await readFileAsDataUrl(file), 'image/gif'];
  }
  // 1280px по большей стороне, JPEG q=0.85: хватает для фона на весь экран, data URL умеренного размера для localStorage.
  return [await resizeImageToJpegDataUrl(file, 1280, 0.85), 'image/jpeg'];
}

// Один раз при инициализации: обработчики пикера файла и кнопки "Сбросить".
export function wireModal(){
  wirePendingImagePicker({
    pickId: 'wallpaper-pick',
    inputId: 'wallpaper-input',
    removeId: 'wallpaper-remove',
    pending,
    needImageKey: 'wallpaper.needImageFile',
    errorKey: 'wallpaper.imageProcessError',
    process: processWallpaperFile,
  });
}

// Из обработчика "Сохранить": применяет pending-изменения.
export function commit(){
  wallpaperStore.set(pending.resolve(wallpaperStore.get()));
  applyWallpaper();
}

export { applyWallpaper };
