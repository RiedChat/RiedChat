// ===================== features/font-settings/wire.js =====================
// Координатор DOM-обвязки настроек шрифта сообщений: находит элементы,
// выставляет начальное состояние и делегирует обработчики в
// wire-select.js / wire-upload.js / wire-remove.js (общее - wire-shared.js).
// Логика хранения - features/font-settings/storage.js, применение к CSS -
// features/font-settings/font-face.js.
import { $ } from '../../core/dom-utils.js';
import { loadFontSettings } from './storage.js';
import { fontSettingsShared } from './wire-shared.js';
import { wireFontSelect } from './wire-select.js';
import { wireFontUpload } from './wire-upload.js';
import { wireFontRemove } from './wire-remove.js';

export function wireFontSettings(){
  const select = $('font-family-select');
  const slider = $('font-size-slider');
  const sizeLabel = $('font-size-value');
  const uploadBtn = $('font-upload-btn');
  const uploadInput = $('font-upload-input');
  const uploadName = $('font-upload-name');
  const uploadRemove = $('font-upload-remove');
  const customOption = $('custom-font-option');
  if(!select || !slider) return;

  const customOptionEls = { customOption, uploadName, uploadRemove };
  const { refreshCustomOptionUi } = fontSettingsShared;

  const current = loadFontSettings();
  refreshCustomOptionUi(customOptionEls);
  select.value = current.family || '';
  // Если сохранённое значение - "свой шрифт", но файла почему-то уже нет
  // (например, очистили хранилище браузера вручную), откатываемся на дефолт.
  if(select.value !== (current.family || '')) select.value = '';
  slider.value = current.size;
  if(sizeLabel) sizeLabel.textContent = Math.round(current.size) + ' px';

  wireFontSelect({ select, slider, sizeLabel });
  wireFontUpload({ uploadBtn, uploadInput, select, slider }, customOptionEls);
  wireFontRemove({ uploadRemove, select, slider }, customOptionEls);
}
