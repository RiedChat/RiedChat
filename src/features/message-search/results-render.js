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

// Потолок числа отрисовываемых результатов - без него частое слово в
// многотысячной истории строило бы (и вставляло в DOM одним setHTML) список
// из тысяч <div>, хотя реально видно на экране от силы десяток: сам скролл
// списка результатов при этом не виртуализирован (в отличие от chat-view/
// virtual-list.js), поэтому ограничиваем на входе, а не после рендера.
// Совмещено с обходом списка С КОНЦА (см. ниже) - самые свежие совпадения и
// так нужны первыми, а обход с конца вдобавок даёт ранний выход, не
// дожидаясь прохода по всей истории, когда лимит уже набран.
const RESULTS_LIMIT = 200;

function renderTextResults(q){
  const results = $('search-results');
  const list = S.messages[S.activeChat] || [];
  if(!q){
    setHTML(results, html`<div class="search-empty">${t('search.enterWord')}</div>`);
    return;
  }
  const matches = [];
  // Обход С КОНЦА (самые новые сообщения) с ранним выходом по RESULTS_LIMIT -
  // на длинной истории с частым словом это избавляет от полного O(n)
  // прохода+toLowerCase+regex по всем сообщениям ради результата, где
  // реально нужны только последние совпадения (список и так показывается
  // "свежее сверху" - см. ниже, порядок обхода уже даёт нужную сортировку
  // без отдельного slice().reverse()).
  for(let idx = list.length - 1; idx >= 0 && matches.length < RESULTS_LIMIT; idx--){
    const m = list[idx];
    // Голые ссылки на вложения текстовым поиском не ищем - для них есть
    // отдельные кнопки-фильтры выше.
    if(m && typeof m.body === 'string' && !classifyMediaBody(m.body) && m.body.toLowerCase().includes(q)) matches.push({m, idx});
  }
  if(!matches.length){
    setHTML(results, html`<div class="search-empty">${t('search.noMatches')}</div>`);
    return;
  }
  const rowsHtml = matches.map(({m, idx}) => {
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
  const list = S.messages[S.activeChat] || [];
  const matches = [];
  // Тот же приём, что и в renderTextResults: с конца истории + ранний
  // выход по RESULTS_LIMIT, без отдельного slice().reverse() поверх
  // полного списка совпадений.
  for(let idx = list.length - 1; idx >= 0 && matches.length < RESULTS_LIMIT; idx--){
    const m = list[idx];
    if(!m || typeof m.body !== 'string') continue;
    const info = classifyMediaBody(m.body);
    if(!info || info.category !== kind) continue;
    if(q && !fileNameOf(info.url).toLowerCase().includes(q)) continue;
    matches.push({m, idx, info});
  }
  if(!matches.length){
    setHTML(results, html`<div class="search-empty">${q ? t('search.noMatches') : t('search.noAttachments')}</div>`);
    return;
  }
  const rowsHtml = matches.map(({m, idx, info}) => {
    return String(html`<div class="search-result-item search-result-media" data-idx="${String(idx)}">
      <div class="search-result-thumb" data-thumb-idx="${String(idx)}">${raw(thumbFallbackHtml(info))}</div>
      <div class="search-result-media-info">
        <div class="search-result-meta">${authorLabel(m)} · ${fmtTime(m.time)}</div>
        <div class="search-result-text">${raw(mediaLabel(info))}</div>
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
  // Общая точка сброса observer'а превью - раньше вызывалась только в
  // renderMediaResults, поэтому переключение с галереи на текстовый поиск
  // заменяло DOM (setHTML ниже) БЕЗ отключения IntersectionObserver: он
  // продолжал держать ссылки на уже отсоединённые от документа узлы
  // галереи вплоть до следующего открытия галереи же. Сброс на каждый
  // рендер (независимо от фильтра) убирает эту утечку.
  resetThumbObserver();
  const q = query.trim().toLowerCase();
  if(activeFilter === 'all') renderTextResults(q);
  else renderMediaResults(activeFilter, q);
}
