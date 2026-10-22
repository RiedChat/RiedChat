// ===================== features/font-settings/storage.js =====================
// Настройки шрифта сообщений и данные загруженного файла шрифта в localStorage. Не по аккаунту, а на устройство (в отличие от features/profile/).
import { lsGet, lsSet, lsRemove } from '../../core/storage.js';

const FAMILY_KEY = 'xmppChatFontFamily';
const SIZE_KEY = 'xmppChatFontSize';
const CUSTOM_FONT_DATA_KEY = 'xmppCustomFontData'; // {b64, ext, filename}
const DEFAULT_SIZE = 14.5; // исходный размер текста пузырька, px
const MIN_SIZE = 13;
const MAX_SIZE = 100;

// FAMILY_KEY/SIZE_KEY - сырые строки, не JSON (family вроде "'Georgia',serif" не валидный JSON), поэтому localStorage напрямую, а не lsGet/lsSet.
// localStorage может быть недоступен (приватный режим Safari и т.п.) - остаются значения по умолчанию.
const rawGet = (key) => { try{ return localStorage.getItem(key); }catch{ return null; } };

export function loadFontSettings(){
  const size = parseFloat(rawGet(SIZE_KEY));
  return {
    family: rawGet(FAMILY_KEY) || '',
    size: Number.isNaN(size) ? DEFAULT_SIZE : Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)),
  };
}

export function saveFontSettings(family, size){
  // Если localStorage недоступен/переполнен, настройка не сохранится до перезагрузки, но в текущей сессии применится (подстановка в DOM отдельно).
  try{
    if(family) localStorage.setItem(FAMILY_KEY, family);
    else localStorage.removeItem(FAMILY_KEY); // "по умолчанию" - убираем свой шрифт
    localStorage.setItem(SIZE_KEY, String(size));
  }catch{}
}

// ---------------- ЗАГРУЖЕННЫЙ С УСТРОЙСТВА ШРИФТ (localStorage, на устройство) ----------------
export function loadCustomFontData(){
  return lsGet(CUSTOM_FONT_DATA_KEY, null);
}
export function saveCustomFontData(data){
  if(data) lsSet(CUSTOM_FONT_DATA_KEY, data);
  else lsRemove(CUSTOM_FONT_DATA_KEY);
}

export const CUSTOM_VALUE = '__custom__'; // значение <option> для своего шрифта
export const CUSTOM_CSS_NAME = 'RiedChatUserFont'; // имя FontFace своего шрифта
export const MAX_FONT_BYTES = 3 * 1024 * 1024; // 3 МБ
