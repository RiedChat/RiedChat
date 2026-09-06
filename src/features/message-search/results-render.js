// ============ features/message-search/results-render.js ============
// Рендер списка результатов поиска: обычный текстовый поиск и галерея
// вложений по типу (Фото/Стикеры/Видео/Кружки/Аудио/Файлы).
import { $ } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { classifyMediaBody, fileNameOf, senderJidFor } from './classify.js';
import { fmtTime, buildSnippet, authorLabel, thumbFallbackHtml, mediaLabel } from './format.js';
import { observeThumb, resetThumbObserver } from './thumb-loader.js';
import { t } from '../../i18n/t.js';

const S = state;

function renderTextResults(q){
  const results = $('search-results');
  const list = S.messages[S.activeChat] || [];
  if(!q){
    setHTML(results, html`<div class="search-empty">${t('search.enterWord')}</div>`);
    return;
  }
  const matches = [];
  list.forEach((m, idx) => {
    // Голые ссылки на вложения текстовым поиском не ищем - для них есть
    // отдельные кнопки-фильтры выше.
    if(m && typeof m.body === 'string' && !classifyMediaBody(m.body) && m.body.toLowerCase().includes(q)) matches.push({m, idx});
  });
  if(!matches.length){
    setHTML(results, html`<div class="search-empty">${t('search.noMatches')}</div>`);
    return;
  }
  // Сначала - самые свежие совпадения (список S.messages хронологичен, см. chat-view/render-messages.js:renderMessages).
  const rowsHtml = matches.slice().reverse().map(({m, idx}) => {
    // buildSnippet уже возвращает готовый экранированный HTML - оборачиваем
    // raw, чтобы html не экранировал его повторно.
    return String(html`<div class="search-result-item" data-idx="${String(idx)}">
      <div class="search-result-meta">${authorLabel(m)} · ${fmtTime(m.time)}</div>
      <div class="search-result-text">${raw(buildSnippet(m.body, q))}</div>
    </div>`);
  }).join('');
  setHTML(results, raw(rowsHtml));
}

function renderMediaResults(kind, q){
  const results = $('search-results');
  resetThumbObserver();
  const list = S.messages[S.activeChat] || [];
  const matches = [];
  list.forEach((m, idx) => {
    if(!m || typeof m.body !== 'string') return;
    const info = classifyMediaBody(m.body);
    if(!info || info.category !== kind) return;
    if(q && !fileNameOf(info.url).toLowerCase().includes(q)) return;
    matches.push({m, idx, info});
  });
  if(!matches.length){
    setHTML(results, html`<div class="search-empty">${q ? t('search.noMatches') : t('search.noAttachments')}</div>`);
    return;
  }
  const rowsHtml = matches.slice().reverse().map(({m, idx, info}) => {
    return String(html`<div class="search-result-item search-result-media" data-idx="${String(idx)}">
      <div class="search-result-thumb" data-thumb-idx="${String(idx)}">${raw(thumbFallbackHtml(info))}</div>
      <div class="search-result-media-info">
        <div class="search-result-meta">${authorLabel(m)} · ${fmtTime(m.time)}</div>
        <div class="search-result-text">${mediaLabel(info)}</div>
      </div>
    </div>`);
  }).join('');
  setHTML(results, raw(rowsHtml));
  matches.forEach(({m, idx, info}) => {
    if(info.kind !== 'image' && info.kind !== 'video') return;
    const host = results.querySelector('[data-thumb-idx="' + idx + '"]');
    if(host) observeThumb(host, info, senderJidFor(m));
  });
}

export function renderResults(query, activeFilter){
  const results = $('search-results');
  if(!results) return;
  const q = query.trim().toLowerCase();
  if(activeFilter === 'all') renderTextResults(q);
  else renderMediaResults(activeFilter, q);
}
