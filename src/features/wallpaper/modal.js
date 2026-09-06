// ===================== features/wallpaper/modal.js =====================
// UI-обвязка модалки профиля для обоев: пикер файла, GIF-ветка, превью,
// удаление. Применение к DOM - в render.js, хранение - в storage.js.
import { $, toast } from '../../core/dom-utils.js';
import { readFileAsDataUrl, resizeImageToJpegDataUrl } from '../../core/image-utils.js';
import { applyWallpaper } from './render.js';
import { loadWallpaper, saveWallpaper } from './storage.js';
import { t } from '../../i18n/t.js';


// Несохранённые изменения обоев текущего открытого редактирования -
// сбрасываются каждый раз при открытии модалки профиля, чтобы не
// протащить выбор/удаление из отменённой предыдущей попытки.
let pendingWallpaper = null;   // {b64, type} - новые выбранные обои, ждут "Сохранить"
let pendingWallpaperRemove = false; // true - пользователь нажал "Сбросить"

function renderWallpaperPreview(b64, type){
  const preview = $('wallpaper-preview');
  if(!preview) return;
  if(b64){
    preview.style.backgroundImage = `url(data:${type || 'image/jpeg'};base64,${b64})`;
    $('wallpaper-remove').style.display = '';
  } else {
    preview.style.backgroundImage = '';
    $('wallpaper-remove').style.display = 'none';
  }
}

// Вызывается при каждом открытии модалки профиля: сбрасывает pending-состояние
// и рисует превью текущих сохранённых обоев.
export function openInModal(){
  const wallpaper = loadWallpaper();
  pendingWallpaper = null;
  pendingWallpaperRemove = false;
  renderWallpaperPreview(wallpaper && wallpaper.b64, wallpaper && wallpaper.type);
}

// Вызывается один раз при инициализации модалки: вешает обработчики
// пикера файла и кнопки "Сбросить".
export function wireModal(){
  $('wallpaper-pick').addEventListener('click', () => $('wallpaper-input').click());
  $('wallpaper-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // повторный выбор того же файла должен снова сработать
    if(!file) return;
    if(!file.type || !file.type.startsWith('image/')){
      toast(t('wallpaper.needImageFile'));
      return;
    }
    try{
      if(file.type === 'image/gif'){
        // GIF нельзя прогонять через canvas.toDataURL - тот рисует только
        // один (первый) кадр, и анимация превратилась бы в статичную
        // картинку. Сохраняем файл как есть, только проверяем размер:
        // localStorage обычно ограничен ~5-10МБ на источник, а base64
        // раздувает исходный файл ещё примерно на треть.
        const MAX_GIF_BYTES = 4 * 1024 * 1024;
        if(file.size > MAX_GIF_BYTES){
          toast(t('wallpaper.gifTooLarge'));
          return;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const b64 = dataUrl.split(',')[1];
        pendingWallpaper = {b64, type: 'image/gif'};
        pendingWallpaperRemove = false;
        renderWallpaperPreview(b64, 'image/gif');
      } else {
        // 1280px по большей стороне и JPEG q=0.85 - с запасом достаточно для фона
        // на весь экран, при этом data URL остаётся разумного размера для localStorage.
        const dataUrl = await resizeImageToJpegDataUrl(file, 1280, 0.85);
        const b64 = dataUrl.split(',')[1];
        pendingWallpaper = {b64, type: 'image/jpeg'};
        pendingWallpaperRemove = false;
        renderWallpaperPreview(b64, 'image/jpeg');
      }
    }catch(err){
      toast(t('wallpaper.imageProcessError', { error: err && err.message ? err.message : err }));
    }
  });
  $('wallpaper-remove').addEventListener('click', () => {
    pendingWallpaper = null;
    pendingWallpaperRemove = true;
    renderWallpaperPreview(null, null);
  });
}

// Вызывается из обработчика "Сохранить" в профиле: применяет pending-изменения.
export function commit(){
  if(pendingWallpaperRemove) saveWallpaper(null);
  else if(pendingWallpaper) saveWallpaper(pendingWallpaper);
  applyWallpaper();
}

export { applyWallpaper };

