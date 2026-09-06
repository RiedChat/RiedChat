// ===================== features/theme-settings.js =====================
// Тёмная/светлая тема интерфейса - предпочтение конкретного устройства
// (как шрифт в features/font-settings/ и направление свайпа в
// swipe-settings.js), не привязано к аккаунту. Переключается атрибутом
// data-theme на <html>, который CSS-переменные в css/base.css и подхватывают
// (см. :root[data-theme="light"]). Применяется СРАЗУ по клику на чекбокс в
// модалке профиля, не дожидаясь кнопки "Сохранить" - так удобнее оценить
// результат, не тыкая туда-сюда.
import { lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

const KEY = 'xmppChatTheme';

// 'dark' (по умолчанию) - исходная тёмная тема. 'light' - светлая.
export function loadTheme(){
  return lsGet(KEY, 'dark');
}
export function saveTheme(theme){
  lsSet(KEY, theme === 'light' ? 'light' : 'dark');
}

export function applyTheme(theme){
  if(theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

// Применяется один раз при старте приложения - до первого рендера чата,
// чтобы не было мигания тёмной темой перед переключением на светлую.
export function applyStoredTheme(){
  applyTheme(loadTheme());
}
// Вызывается сразу при импорте модуля (см. main.js - импорт стоит одним из
// первых, сразу после core/storage.js), а не из wireEvents() в app.js:
// document.documentElement существует уже в момент начала парсинга HTML,
// так что тему можно проставить ДО того, как отрисуется остальной интерфейс,
// и не будет короткого мигания тёмной темой перед светлой.
applyStoredTheme();

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('theme-light-toggle').checked = loadTheme() === 'light';
}
// Читает чекбокс модалки профиля и сохраняет (тема уже применена live-
// обработчиком в wireThemeSettings, здесь просто фиксируем в тот же
// localStorage-ключ на случай, если commit() вызывается независимо).
export function commit(){
  saveTheme($('theme-light-toggle').checked ? 'light' : 'dark');
}

export function wireThemeSettings(){
  $('theme-light-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    applyTheme(theme);
    saveTheme(theme);
  });
}
