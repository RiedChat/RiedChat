// ============ features/message-search/results-render.js ============
// Рендер результатов: текстовый поиск и галерея вложений по типу.
import { $ } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { activeMessages } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { fileNameOf } from '../../net/media/mime-kind.js';

import { classifyMediaBody, senderJidFor } from './classify.js';
import { fmtTime, buildSnippet, authorLabel, thumbFallbackHtml, mediaLabelHtml } from './format.js';
import { observeThumb, resetThumbObserver } from './thumb-loader.js';

// Потолок числа результатов: список не виртуализирован, поэтому ограничиваем на входе. Вместе с обходом с конца
// даёт самые свежие совпадения первыми и ранний выход.
const RESULTS_LIMIT = 200;

// Обход С КОНЦА с ранним выходом по RESULTS_LIMIT: не нужен полный O(n)-проход, порядок "свежее сверху" получается без slice().reverse().
// pick(m, idx) возвращает элемент результата или null.
function collectFromEnd(list, pick){
  const matches = [];
  for(let idx = list.length - 1; idx >= 0 && matches.length < RESULTS_LIMIT; idx--){
    const item = pick(list[idx], idx);
    if(item) matches.push(item);
  }
  return matches;
}

function showEmpty(results, text){
  setHTML(results, html`<div class="search-empty">${text}</div>`);
}

function renderTextResults(q){
  const results = $('search-results');
  const list = activeMessages();
  // Голые ссылки на вложения текстовым поиском не ищем - для них фильтры.
  const matches = collectFromEnd(list, (m, idx) =>
    m && typeof m.body === 'string' && !classifyMediaBody(m.body) && (!q || m.body.toLowerCase().includes(q)) ? {m, idx} : null);
  if(!matches.length){ showEmpty(results, t('search.noMatches')); return; }
  const rowsHtml = matches.map(({m, idx}) => {
    // buildSnippet возвращает готовый экранированный HTML - оборачиваем raw, чтобы не экранировать повторно.
    return html`<div class="search-result-item" data-idx="${String(idx)}">
      <div class="search-result-meta">${authorLabel(m)} · ${fmtTime(m.time)}</div>
      <div class="search-result-text">${raw(buildSnippet(m.body, q))}</div>
    </div>`;
  });
  setHTML(results, html`${rowsHtml}`);
}

function renderMediaResults(kind, q){
  const results = $('search-results');
  const list = activeMessages();
  const matches = collectFromEnd(list, (m, idx) => {
    if(!m || typeof m.body !== 'string') return null;
    const info = classifyMediaBody(m.body);
    if(!info || info.category !== kind) return null;
    if(q && !fileNameOf(info.url).toLowerCase().includes(q)) return null;
    return {m, idx, info};
  });
  if(!matches.length){ showEmpty(results, q ? t('search.noMatches') : t('search.noAttachments')); return; }
  const rowsHtml = matches.map(({m, idx, info}) => {
    return html`<div class="search-result-item search-result-media" data-idx="${String(idx)}">
      <div class="search-result-thumb" data-thumb-idx="${String(idx)}">${thumbFallbackHtml(info)}</div>
      <div class="search-result-media-info">
        <div class="search-result-meta">${authorLabel(m)} · ${fmtTime(m.time)}</div>
        <div class="search-result-text">${mediaLabelHtml(info)}</div>
      </div>
    </div>`;
  });
  setHTML(results, html`${rowsHtml}`);
  matches.forEach(({m, idx, info}) => {
    if(info.kind !== 'image' && info.kind !== 'video') return;
    const host = results.querySelector('[data-thumb-idx="' + idx + '"]');
    if(host) observeThumb(host, info, senderJidFor(m));
  });
}

export function renderResults(query, activeFilter){
  const results = $('search-results');
  if(!results) return;
  // Сброс observer превью на каждом рендере: иначе при переходе с галереи на текст он держал ссылки на отсоединённые узлы (утечка).
  resetThumbObserver();
  const q = query.trim().toLowerCase();
  if(activeFilter === 'all') renderTextResults(q);
  else renderMediaResults(activeFilter, q);
}
