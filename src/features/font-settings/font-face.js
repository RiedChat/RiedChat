// ===================== features/font-settings/font-face.js =====================
// Регистрация загруженного пользователем шрифта через FontFace API и
// применение выбранного шрифта/размера к CSS-переменным --chat-font-family/
// --chat-font-size (см. css/base.css и css/messages.css). Действует ТОЛЬКО
// на текст внутри #messages (пузыри переписки, время, системные плашки) -
// меню, сайдбар, шапка чата, поле ввода и модалки этот выбор не затрагивают.
import { fontSettingsConstants, loadFontSettings, loadCustomFontData } from './storage.js';
import { t } from '../../i18n/t.js';

const { CUSTOM_VALUE, CUSTOM_CSS_NAME } = fontSettingsConstants;

let customFontRegistered = false; // чтобы не регистрировать один и тот же FontFace повторно

// Регистрирует загруженный шрифт как CSS font-family через FontFace API.
// Один раз загруженный файл (base64) переживает перезагрузку страницы -
// при каждом старте приложения регистрируем его заново из localStorage.
export function registerCustomFontFace(data){
  if(!data || !data.b64) return Promise.reject(new Error(t('fontSettings.noFontData')));
  if(customFontRegistered) return Promise.resolve();
  try{
    const mime = 'font/' + (data.ext || 'woff2');
    const face = new FontFace(CUSTOM_CSS_NAME, `url(data:${mime};base64,${data.b64})`);
    return face.load().then((loaded) => {
      document.fonts.add(loaded);
      customFontRegistered = true;
    });
  }catch(err){
    return Promise.reject(err);
  }
}

// Сбрасывает флаг регистрации - нужно вызывать при загрузке нового файла
// шрифта или при удалении текущего (features/font-settings/wire.js).
export function resetCustomFontRegistered(){
  customFontRegistered = false;
}

// Применяет сохранённые (или переданные явно) настройки к CSS-переменным
// --chat-font-family/--chat-font-size. Переменные проставляются на <html>,
// но реально их читает только #messages и его потомки.
export function applyFontSettings(overrides){
  const saved = loadFontSettings();
  const family = (overrides && 'family' in overrides) ? overrides.family : saved.family;
  const size = (overrides && 'size' in overrides) ? overrides.size : saved.size;
  const root = document.documentElement;

  if(family === CUSTOM_VALUE){
    const data = loadCustomFontData();
    if(data){
      // Пока шрифт грузится (первый раз после старта страницы) - на секунду
      // остаётся текущий шрифт, затем FontFace подменяет отрисовку сама,
      // без перезагрузки страницы (это штатное поведение браузера, "FOUT").
      registerCustomFontFace(data).catch(() => {});
      root.style.setProperty('--chat-font-family', `'${CUSTOM_CSS_NAME}',sans-serif`);
    } else {
      root.style.removeProperty('--chat-font-family'); // файла нет (например, стёрли localStorage) - откат на стандартный
    }
  } else if(family){
    root.style.setProperty('--chat-font-family', family);
  } else {
    root.style.removeProperty('--chat-font-family'); // вернёт значение по умолчанию (inherit -> Inter)
  }
  root.style.setProperty('--chat-font-size', size + 'px');
}

// Применяем как можно раньше - сам этот файл подключён в index.html сразу
// после core/dom-utils.js.
applyFontSettings();
