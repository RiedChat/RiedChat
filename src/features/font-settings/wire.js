// ===================== features/font-settings/wire.js =====================
// DOM-обвязка шрифта: select готового шрифта, slider размера, загрузка/удаление своего файла. Хранение - storage.js, применение - font-face.js.
import { debugLog } from '../../core/debug-log.js';
import { $, toast, wireFilePicker } from '../../core/dom-utils.js';
import { readFileAsDataUrl } from '../../core/image-utils.js';
import { extOf } from '../../core/text-patterns.js';
import { t } from '../../i18n/t.js';

import { applyFontSettings, registerCustomFontFace, resetCustomFontRegistered } from './font-face.js';
import {
  MAX_FONT_BYTES, CUSTOM_VALUE, loadFontSettings, saveFontSettings,
  loadCustomFontData, saveCustomFontData,
} from './storage.js';


const FONT_EXTS = ['woff2', 'woff', 'otf', 'ttf'];

const setSizeLabel = (el, size) => { if(el) el.textContent = Math.round(size) + ' px'; };

// Сохраняет и сразу применяет выбор (вместо пары saveFontSettings+applyFontSettings в каждом обработчике).
function commit(family, size){
  saveFontSettings(family, size);
  applyFontSettings({family, size});
}

// Показывает/скрывает пункт "Мой файл" и кнопку удаления по наличию сохранённого шрифта. els: {customOption, uploadName, uploadRemove}
function refreshCustomOptionUi({ customOption, uploadName, uploadRemove }){
  const data = loadCustomFontData();
  customOption.hidden = !data;
  if(data) customOption.textContent = t('fontSettings.customFilePrefix', { name: data.filename || t('fontSettings.fontFallback') });
  uploadName.textContent = data ? (data.filename || t('fontSettings.uploadedFallback')) : '';
  uploadRemove.hidden = !data;
}

// Select готового шрифта и slider размера.
function wireFontSelect({ select, slider, sizeLabel }){
  select.addEventListener('change', () => {
    const family = select.value;
    if(family === CUSTOM_VALUE && !loadCustomFontData()){
      toast(t('fontSettings.uploadFirst'));
      select.value = '';
      return;
    }
    commit(family, slider.valueAsNumber);
  });

  slider.addEventListener('input', () => {
    const size = slider.valueAsNumber;
    setSizeLabel(sizeLabel, size);
    applyFontSettings({family: select.value, size});
  });
  slider.addEventListener('change', () => {
    saveFontSettings(select.value, slider.valueAsNumber);
  });
}

// Загрузка своего шрифта (.ttf/.otf/.woff/.woff2): проверка расширения/размера и разбора браузером, сохранение, применение.
function wireFontUpload({ select, slider }, customOptionEls){
  wireFilePicker('font-upload-btn', 'font-upload-input', async (files) => {
    const file = files[0];

    const ext = extOf(file.name);
    if(!FONT_EXTS.includes(ext)){
      toast(t('fontSettings.invalidExt'));
      return;
    }
    if(file.size > MAX_FONT_BYTES){
      toast(t('fontSettings.tooLarge'));
      return;
    }

    try{
      const dataUrl = await readFileAsDataUrl(file);
      const b64 = dataUrl.split(',')[1];
      const data = {b64, ext, filename: file.name};

      // Проверяем, что браузер разберёт файл как шрифт, ДО сохранения - иначе сохранится битый файл.
      resetCustomFontRegistered();
      await registerCustomFontFace(data);

      saveCustomFontData(data);
      refreshCustomOptionUi(customOptionEls);
      select.value = CUSTOM_VALUE;
      commit(CUSTOM_VALUE, slider.valueAsNumber);
      toast(t('fontSettings.appliedSuccess'));
    }catch(err){
      debugLog('font upload parse error:', err);
      toast(t('fontSettings.parseError'));
    }
  });
}

// Удаление сохранённого шрифта.
function wireFontRemove({ uploadRemove, select, slider }, customOptionEls){
  uploadRemove.addEventListener('click', () => {
    saveCustomFontData(null);
    resetCustomFontRegistered();
    refreshCustomOptionUi(customOptionEls);
    if(select.value === CUSTOM_VALUE){
      select.value = '';
      commit('', slider.valueAsNumber);
    }
    toast(t('fontSettings.removed'));
  });
}

export function wireFontSettings(){
  const select = $('font-family-select');
  const slider = $('font-size-slider');
  const sizeLabel = $('font-size-value');
  const uploadRemove = $('font-upload-remove');

  const customOptionEls = {
    customOption: $('custom-font-option'),
    uploadName: $('font-upload-name'),
    uploadRemove,
  };

  const current = loadFontSettings();
  refreshCustomOptionUi(customOptionEls);
  select.value = current.family || '';
  // Сохранён "свой шрифт", но файла нет (очистили хранилище) - откат на дефолт.
  if(select.value !== (current.family || '')) select.value = '';
  slider.value = current.size;
  setSizeLabel(sizeLabel, current.size);

  wireFontSelect({ select, slider, sizeLabel });
  wireFontUpload({ select, slider }, customOptionEls);
  wireFontRemove({ uploadRemove, select, slider }, customOptionEls);
}
