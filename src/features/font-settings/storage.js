// ===================== features/font-settings/storage.js =====================
// Чтение/запись настроек шрифта сообщений и данных загруженного пользователем
// файла шрифта в localStorage. Хранится НЕ по аккаунту (в отличие от
// профиля/обоев/видео-настроек в features/profile.js) - это предпочтение
// устройства, действует на любом аккаунте на этом устройстве.
import { lsGet, lsSet, lsRemove } from '../../core/storage.js';

const FAMILY_KEY = 'xmppChatFontFamily';
const SIZE_KEY = 'xmppChatFontSize';
const CUSTOM_FONT_DATA_KEY = 'xmppCustomFontData'; // {b64, ext, filename}
const DEFAULT_SIZE = 14.5; // исходный размер текста пузырька, px
const MIN_SIZE = 13;
const MAX_SIZE = 100;

// FAMILY_KEY/SIZE_KEY хранятся как сырые строки (не JSON) - family может
// быть произвольным CSS font-family вида "'Georgia',serif", который сам
// по себе не валидный JSON, поэтому здесь используется localStorage
// напрямую, а не lsGet/lsSet (те рассчитаны на JSON-значения).
export function loadFontSettings(){
  let family = '';
  let size = DEFAULT_SIZE;
  // localStorage может быть недоступен (приватный режим Safari, отключены
  // сайт-данные и т.п.) - в этом случае просто остаёмся на значениях
  // по умолчанию, объявленных выше.
  try{ family = localStorage.getItem(FAMILY_KEY) || ''; }catch(e){}
  try{
    const parsed = parseFloat(localStorage.getItem(SIZE_KEY));
    if(!isNaN(parsed)) size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, parsed));
  }catch(e){}
  return {family, size};
}

export function saveFontSettings(family, size){
  // Если localStorage недоступен/переполнен - настройка шрифта просто не
  // сохранится до перезагрузки, это не мешает применить её в текущей сессии
  // (сама подстановка шрифта в DOM делается отдельно, не отсюда).
  try{
    if(family) localStorage.setItem(FAMILY_KEY, family);
    else localStorage.removeItem(FAMILY_KEY); // "по умолчанию" - убираем свой шрифт
    localStorage.setItem(SIZE_KEY, String(size));
  }catch(e){}
}

// ---------------- ЗАГРУЖЕННЫЙ С УСТРОЙСТВА ШРИФТ (localStorage, на устройство) ----------------
export function loadCustomFontData(){
  return lsGet(CUSTOM_FONT_DATA_KEY, null);
}
export function saveCustomFontData(data){
  if(data) lsSet(CUSTOM_FONT_DATA_KEY, data);
  else lsRemove(CUSTOM_FONT_DATA_KEY);
}

export const fontSettingsConstants = {
  CUSTOM_VALUE: '__custom__',       // значение <option>, выбранное когда используется загруженный шрифт
  CUSTOM_CSS_NAME: 'RiedChatUserFont', // имя, под которым свой шрифт регистрируется через FontFace
  MAX_FONT_BYTES: 3 * 1024 * 1024,  // 3 МБ - с запасом хватает даже на "жирные" TTF с кириллицей
};
