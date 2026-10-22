// ===================== core/safe-html.js =====================
// html`...` экранирует каждую подстановку ${...}, кроме обёрнутых в raw(...): при ручной склейке забытый
// escapeHtml - XSS, а здесь "доверяю строке" нужно объявлять явно.

export function escapeHtml(s){
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

class SafeHtml { constructor(s){ this.s = s; } toString(){ return this.s; } }

// Помечает строку как безопасный HTML (результат html`...`/escapeHtml), чтобы вложенные шаблоны не экранировались
// повторно. НЕ для сырых данных от сервера/собеседника.
export const raw = (str) => new SafeHtml(str);

// Склейка CSS-классов: пропускает ложные значения (cx('a', ok && 'b') -> 'a b' или 'a'). Результат - обычная строка: html`` экранирует её сам, raw не нужен.
export const cx = (...parts) => parts.filter(Boolean).join(' ');

const stringify = (v) =>
  v == null ? ''
  : v instanceof SafeHtml ? v.s
  : Array.isArray(v) ? v.map(stringify).join('')
  : escapeHtml(String(v));

export const html = (strings, ...values) =>
  raw(strings.reduce((out, s, i) => out + stringify(values[i - 1]) + s));

// Вместо el.innerHTML = ...: принимает только raw(...) (результат html``), сырая строка бросает ошибку.
export function setHTML(el, safe){
  if(safe != null && !(safe instanceof SafeHtml)) throw new Error('setHTML: ожидается html`...`/raw(...), а не сырая строка - оберните через html`...`');
  el.innerHTML = safe == null ? '' : safe.s;
}
