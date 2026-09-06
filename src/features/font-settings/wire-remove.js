// ===================== features/font-settings/wire-remove.js =====================
// Удаление сохранённого своего файла шрифта. Выделено из wire.js.
import { fontSettingsConstants, saveCustomFontData } from './storage.js';
import { resetCustomFontRegistered } from './font-face.js';
import { fontSettingsShared } from './wire-shared.js';
import { toast } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';

const { CUSTOM_VALUE } = fontSettingsConstants;
const { commit, refreshCustomOptionUi } = fontSettingsShared;

// els: {uploadRemove, select, slider} + customOptionEls для refreshCustomOptionUi
export function wireFontRemove(els, customOptionEls){
  const { uploadRemove, select, slider } = els;
  if(!uploadRemove) return;

  uploadRemove.addEventListener('click', () => {
    saveCustomFontData(null);
    resetCustomFontRegistered();
    refreshCustomOptionUi(customOptionEls);
    if(select.value === CUSTOM_VALUE){
      select.value = '';
      commit('', parseFloat(slider.value));
    }
    toast(t('fontSettings.removed'));
  });
}
