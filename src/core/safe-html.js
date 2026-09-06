// ===================== core/safe-html.js =====================
// Проблема с ручной склейкой строк для innerHTML: escapeHtml нужно не
// забыть вызвать вокруг КАЖДОЙ подстановки, и один пропущенный вызов -
// XSS. bubble-renderers.js и media-loader.js уже переведены на html`...`
// и подстановки из данных сообщения (data-download-url, href/src)
// экранируются корректно.
// html`...` решает эту проблему структурно: любая подстановка ${...}
// экранируется автоматически, если только она не обёрнута в raw(...) -
// то есть разработчику придётся explicitly сказать "я доверяю этой
// строке", а не забыть explicitly её экранировать.
import { escapeHtml } from './dom-utils.js';

const RAW = Symbol('raw-html');

// Помечает строку как уже безопасный HTML (например - результат другого
// html`...`), чтобы вложенные шаблоны не экранировались повторно.
// Использовать ТОЛЬКО для строк, которые сами уже прошли через html
// или escapeHtml - не для сырых данных с сервера/от собеседника.
export function raw(str){ return { [RAW]: true, toString: () => str }; }

function stringifyValue(v){
  const value = v ?? '';
  if(value === '') return '';
  if(value[RAW]) return String(value);
  if(Array.isArray(v)) return v.map(stringifyValue).join('');
  return escapeHtml(String(v));
}

export function html(strings, ...values){
  let out = strings[0];
  for(let i = 0; i < values.length; i++){
    out += stringifyValue(values[i]) + strings[i + 1];
  }
  return raw(out);
}

// Тонкая обёртка вместо el.innerHTML = ...: принимает только raw(...)
// (то, что вернул html``), сырую строку - не примет ни при каких
// условиях. Так использование "не глядя" со строкой из data-атрибута
// или из ответа сервера просто упадёт в рантайме, а не тихо создаст дыру.
export function setHTML(el, safe){
  const value = safe ?? null;
  if(value === null){ el.innerHTML = ''; return; }
  if(!value[RAW]) throw new Error('setHTML: ожидается html`...`/raw(...), а не сырая строка - оберните через html`...`');
  el.innerHTML = String(value);
}
