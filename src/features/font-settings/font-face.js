// ===================== features/font-settings/font-face.js =====================
// Регистрация загруженного шрифта через FontFace API и применение шрифта/размера к CSS-переменным --chat-font-family/--chat-font-size
// (css/base.css, css/messages.css). Действует только на текст внутри #messages.
import { t } from '../../i18n/t.js';

import { CUSTOM_VALUE, CUSTOM_CSS_NAME, loadFontSettings, loadCustomFontData } from './storage.js';

let customFontRegistered = false; // не регистрировать FontFace повторно

// Регистрирует загруженный шрифт как CSS font-family через FontFace API; файл (base64) переживает перезагрузку, при старте регистрируем заново из localStorage.
export async function registerCustomFontFace(data){
  if(!data || !data.b64) throw new Error(t('fontSettings.noFontData'));
  if(customFontRegistered) return;
  const mime = 'font/' + (data.ext || 'woff2');
  const face = new FontFace(CUSTOM_CSS_NAME, `url(data:${mime};base64,${data.b64})`);
  document.fonts.add(await face.load());
  customFontRegistered = true;
}

// Сбрасывает флаг регистрации при загрузке нового файла или удалении текущего (features/font-settings/wire.js).
export function resetCustomFontRegistered(){
  customFontRegistered = false;
}

// Применяет сохранённые (или переданные) настройки к --chat-font-family/--chat-font-size на <html>; читает их только #messages и потомки.
export function applyFontSettings(overrides){
  const saved = loadFontSettings();
  const family = (overrides && 'family' in overrides) ? overrides.family : saved.family;
  const size = (overrides && 'size' in overrides) ? overrides.size : saved.size;
  const root = document.documentElement;

  if(family === CUSTOM_VALUE){
    const data = loadCustomFontData();
    if(data){
      // Пока шрифт грузится, остаётся текущий, затем FontFace подменяет сам (штатный FOUT).
      registerCustomFontFace(data).catch(() => {});
      root.style.setProperty('--chat-font-family', `'${CUSTOM_CSS_NAME}',sans-serif`);
    } else {
      root.style.removeProperty('--chat-font-family'); // файла нет (стёрли localStorage) - откат на стандартный
    }
  } else if(family){
    root.style.setProperty('--chat-font-family', family);
  } else {
    root.style.removeProperty('--chat-font-family'); // значение по умолчанию (inherit -> Inter)
  }
  root.style.setProperty('--chat-font-size', size + 'px');
}

// Применяем как можно раньше: файл подключён в index.html сразу после core/dom-utils.js.
applyFontSettings();
