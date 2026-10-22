// ===================== i18n/t.js =====================
// Мини-i18n: словари в locales/*.json, t('a.b.c', {p: 'x'}) подставляет {p}.
// Язык: localStorage[STORAGE_KEY], иначе navigator.language (en -> en, остальное -> ru).
import en from '../../locales/en.json';
import ru from '../../locales/ru.json';

const LOCALES = { ru, en };
const STORAGE_KEY = 'riedchat_locale';

function detectDefault(){
  // localStorage может быть недоступен - тогда берём navigator.language.
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved && LOCALES[saved]) return saved;
  }catch{}
  const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  return LOCALES[nav] ? nav : 'ru';
}

const current = detectDefault();

// Текущий язык ('ru' | 'en') - для форматирования дат/времени.
export const getLocale = () => current;

function lookup(dict, path){
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
}

function interpolate(str, params){
  if(!params) return str;
  return Object.keys(params).reduce(
    (s, k) => s.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]),
    str
  );
}

// Строка по ключу 'ns.key'; нет в текущей локали - ru; нет и там - сам ключ (виден в UI).
export function t(key, params){
  let str = lookup(LOCALES[current], key);
  if(str === undefined) str = lookup(LOCALES.ru, key);
  if(str === undefined) return key;
  return interpolate(str, params);
}

// Переводы ключа во всех локалях (без повторов): строка уходит собеседнику на языке
// отправителя и сверяется с другой локалью (см. features/message-swipe/shared.js).
export function tAll(key){
  return [...new Set(Object.values(LOCALES).map(d => lookup(d, key)).filter(v => v !== undefined))];
}

// Переводит разметку в root (по умолчанию документ):
// data-i18n -> textContent, data-i18n-html -> innerHTML (только доверенные строки locales/*),
// data-i18n-placeholder -> placeholder, data-i18n-title -> title.
// Вызывается один раз при старте (main.js).
export function applyDom(root){
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}
