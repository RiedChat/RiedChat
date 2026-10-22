// ===================== features/theme-settings.js =====================
// Тема тёмная/светлая - настройка устройства (как шрифт и свайп), не аккаунта. Переключается атрибутом data-theme на <html> (css/base.css, :root[data-theme="light"]).
// Применяется и сохраняется сразу по клику на чекбокс в профиле, без "Сохранить" (поэтому commit() не нужен и в sections модалки профиля модуль не входит).
import { $ } from '../core/dom-utils.js';
import { lsGet, lsSet } from '../core/storage.js';

const KEY = 'xmppChatTheme'; // 'dark' (по умолчанию) или 'light'

const applyTheme = (theme) => { document.documentElement.dataset.theme = theme; };

// Применяется при импорте (main.js, сразу после core/storage.js), а не из wireEvents() в app.js: document.documentElement есть с начала парсинга, тема ставится до отрисовки интерфейса.
applyTheme(lsGet(KEY, 'dark'));

// Чекбокс профиля из сохранённой темы.
export function openInModal(){
  $('theme-light-toggle').checked = lsGet(KEY, 'dark') === 'light';
}

export function wireThemeSettings(){
  $('theme-light-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    applyTheme(theme);
    lsSet(KEY, theme);
  });
}
