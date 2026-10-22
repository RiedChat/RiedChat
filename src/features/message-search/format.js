// ============ features/message-search/format.js ============
// Форматирование данных для списка результатов.
import { contactName } from '../../core/dom-utils.js';
import { icon } from '../../core/icons.js';
import { html, raw } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { collapseWs } from '../../core/text-patterns.js';
import { t, getLocale } from '../../i18n/t.js';
import { fileNameOf } from '../../net/media/mime-kind.js';
import { mediaKindKey, mediaKindSymbol } from '../message-swipe/shared.js';

export function fmtTime(ts){
  return new Date(ts).toLocaleString(getLocale(), {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}

// Вырезает фрагмент вокруг найденного слова и оборачивает совпадение в <mark>; остальной текст экранируется отдельно, инъекция невозможна.
export function buildSnippet(body, q){
  const text = collapseWs(body);
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if(i === -1) return String(html`${text.slice(0, 90)}`);
  const ctx = 34;
  const start = Math.max(0, i - ctx);
  const end = Math.min(text.length, i + q.length + ctx);
  const before = text.slice(start, i);
  const match = text.slice(i, i + q.length);
  const after = text.slice(i + q.length, end);
  return (start > 0 ? '…' : '') +
    String(html`${before}<mark>${match}</mark>${after}`) +
    (end < text.length ? '…' : '');
}

export const authorLabel = (m) => m?.out ? t('common.you') : contactName(state.activeChat);

// Иконка-заглушка на время ленивой расшифровки или финальная подпись для типов без превью (аудио/файл).
// У стикеров/кружков своя иконка (categoryOf в classify.js).
export function thumbFallbackHtml(info){
  const symbol = mediaKindSymbol(info.kind, info.category);
  return html`<span class="search-thumb-fallback">${raw(icon(symbol))}</span>`;
}

// Подпись под превью: svg-иконка + локализованный текст. В отличие от message-swipe/shared.js:mediaLabel (эмодзи);
// иконка из той же таблицы KINDS, что и в thumbFallbackHtml.
export function mediaLabelHtml(info){
  const symbol = mediaKindSymbol(info.kind, info.category);
  const text = info.kind === 'file' ? (fileNameOf(info.url) || t('common.fileFallbackWord'))
    : t(mediaKindKey(info.kind, info.category));
  return html`${raw(icon(symbol, 'search-result-label-icon'))}<span>${text}</span>`;
}
