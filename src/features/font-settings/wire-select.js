// ===================== features/font-settings/wire-select.js =====================
// Обвязка выбора готового шрифта (select) и ползунка размера (slider).
// Выделено из wire.js. Общие commit/refreshCustomOptionUi - wire-shared.js.
import { fontSettingsConstants, loadCustomFontData, saveFontSettings } from './storage.js';
import { applyFontSettings } from './font-face.js';
import { fontSettingsShared } from './wire-shared.js';
import { toast } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';

const { CUSTOM_VALUE } = fontSettingsConstants;
const { commit } = fontSettingsShared;

// els: {select, slider, sizeLabel}
export function wireFontSelect(els){
  const { select, slider, sizeLabel } = els;

  select.addEventListener('change', () => {
    const family = select.value;
    if(family === CUSTOM_VALUE && !loadCustomFontData()){
      toast(t('fontSettings.uploadFirst'));
      select.value = '';
      return;
    }
    commit(family, parseFloat(slider.value));
  });

  slider.addEventListener('input', () => {
    const size = parseFloat(slider.value);
    if(sizeLabel) sizeLabel.textContent = Math.round(size) + ' px';
    applyFontSettings({family: select.value, size});
  });
  slider.addEventListener('change', () => {
    saveFontSettings(select.value, parseFloat(slider.value));
  });
}
