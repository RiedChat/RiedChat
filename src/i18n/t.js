// ===================== i18n/t.js =====================
// Минимальный i18n-хелпер без зависимостей: словари лежат в locales/*.json,
// t('a.b.c', {param: 'x'}) достаёт строку по пути и подставляет {param}.
// Язык хранится в localStorage и переопределяется вручную через setLocale();
// по умолчанию берётся из navigator.language (en -> en, всё остальное -> ru).
import ru from '../../locales/ru.json';
import en from '../../locales/en.json';

const LOCALES = { ru, en };
const STORAGE_KEY = 'riedchat_locale';

function detectDefault(){
  // localStorage может быть недоступен (приватный режим и т.п.) - тогда
  // просто определяем язык по navigator.language, как если бы сохранённого
  // выбора не было вовсе.
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved && LOCALES[saved]) return saved;
  }catch(e){}
  const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  return LOCALES[nav] ? nav : 'ru';
}

let current = detectDefault();

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

// Возвращает переведённую строку по ключу вида 'namespace.key'. Если ключа
// нет в текущей локали - падает на ru, если нет и там - возвращает сам ключ
// (чтобы отсутствие перевода было видно в интерфейсе, а не рушило рендер).
export function t(key, params){
  let str = lookup(LOCALES[current], key);
  if(str === undefined) str = lookup(LOCALES.ru, key);
  if(str === undefined) return key;
  return interpolate(str, params);
}

export function getLocale(){
  return current;
}

export function availableLocales(){
  return Object.keys(LOCALES);
}

export function setLocale(lang){
  if(!LOCALES[lang] || lang === current) return;
  current = lang;
  // Если localStorage недоступен - выбор языка просто не переживёт
  // перезагрузку, current уже переключён строкой выше, интерфейс
  // (applyDom() ниже) обновится как обычно в рамках текущей сессии.
  try{ localStorage.setItem(STORAGE_KEY, lang); }catch(e){}
  applyDom();
}

// Переводит статическую разметку внутри root (по умолчанию - весь документ):
// data-i18n            -> textContent
// data-i18n-html       -> innerHTML (только доверенные строки из locales/*)
// data-i18n-placeholder -> placeholder
// data-i18n-title      -> title
// Вызывается один раз при старте (см. main.js) и повторно из setLocale().
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
