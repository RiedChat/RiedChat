// ===================== features/font-settings/wire-shared.js =====================
// Общие хелперы, используемые всеми частями DOM-обвязки настроек шрифта:
// сохранение+применение текущего выбора и синхронизация UI со состоянием
// "загружен ли свой файл шрифта". Выделено из wire.js.
import { saveFontSettings, loadCustomFontData } from './storage.js';
import { applyFontSettings } from './font-face.js';
import { t } from '../../i18n/t.js';

export const fontSettingsShared = {
  // Сохраняет и сразу применяет текущий выбор - используется во всех
  // обработчиках вместо повторения пары saveFontSettings+applyFontSettings.
  commit(family, size){
    saveFontSettings(family, size);
    applyFontSettings({family, size});
  },

  // Показывает/скрывает пункт "Мой файл" в select и кнопку удаления
  // в зависимости от того, есть ли сохранённые данные своего шрифта.
  refreshCustomOptionUi(els){
    const { customOption, uploadName, uploadRemove } = els;
    const data = loadCustomFontData();
    if(data){
      if(customOption){
        customOption.textContent = t('fontSettings.customFilePrefix', { name: data.filename || t('fontSettings.fontFallback') });
        customOption.style.display = '';
      }
      if(uploadName) uploadName.textContent = data.filename || t('fontSettings.uploadedFallback');
      if(uploadRemove) uploadRemove.style.display = '';
    } else {
      if(customOption) customOption.style.display = 'none';
      if(uploadName) uploadName.textContent = '';
      if(uploadRemove) uploadRemove.style.display = 'none';
    }
  },
};
