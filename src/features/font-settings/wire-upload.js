// ===================== features/font-settings/wire-upload.js =====================
// Загрузка своего файла шрифта (.ttf/.otf/.woff/.woff2): валидация
// расширения/размера, проверка что браузер способен разобрать файл,
// сохранение и применение. Выделено из wire.js.
import { fontSettingsConstants, saveCustomFontData } from './storage.js';
import { registerCustomFontFace, resetCustomFontRegistered } from './font-face.js';
import { fontSettingsShared } from './wire-shared.js';
import { toast } from '../../core/dom-utils.js';
import { readFileAsDataUrl } from '../../core/image-utils.js';
import { t } from '../../i18n/t.js';
import { debugLog } from '../../core/debug-log.js';

const { MAX_FONT_BYTES, CUSTOM_VALUE } = fontSettingsConstants;
const { commit, refreshCustomOptionUi } = fontSettingsShared;

function extFromName(name){
  name = (name || '').toLowerCase();
  if(name.endsWith('.woff2')) return 'woff2';
  if(name.endsWith('.woff')) return 'woff';
  if(name.endsWith('.otf')) return 'otf';
  if(name.endsWith('.ttf')) return 'ttf';
  return null;
}

// els: {uploadBtn, uploadInput, select, slider} + customOptionEls для refreshCustomOptionUi
export function wireFontUpload(els, customOptionEls){
  const { uploadBtn, uploadInput, select, slider } = els;
  if(!uploadBtn || !uploadInput) return;

  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // повторный выбор того же файла должен снова сработать
    if(!file) return;

    const ext = extFromName(file.name);
    if(!ext){
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

      // Проверяем, что браузер вообще способен разобрать этот файл как
      // шрифт, ДО того как сохранить его - иначе можно молча сохранить
      // битый/неподдерживаемый файл.
      resetCustomFontRegistered();
      await registerCustomFontFace(data);

      saveCustomFontData(data);
      refreshCustomOptionUi(customOptionEls);
      select.value = CUSTOM_VALUE;
      commit(CUSTOM_VALUE, parseFloat(slider.value));
      toast(t('fontSettings.appliedSuccess'));
    }catch(err){
      debugLog('font upload parse error:', err);
      toast(t('fontSettings.parseError'));
    }
  });
}
