// ============ features/message-search/format.js ============
// Форматирование данных для отображения в списке результатов поиска.
import { html } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { nickOf } from '../../core/dom-utils.js';
import { mediaLabel as kindLabelFor } from '../message-swipe.js';
import { fileNameOf } from './classify.js';
import { t } from '../../i18n/t.js';

const S = state;

export function fmtTime(t){
  return new Date(t).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}

// Вырезает вокруг найденного слова короткий фрагмент текста (как в поиске
// Telegram/WhatsApp) и оборачивает совпадение в <mark> - весь остальной
// текст экранируется отдельно, поэтому HTML-инъекция через текст сообщения
// здесь невозможна, несмотря на то, что <mark> вставляется напрямую.
export function buildSnippet(body, q){
  const raw = String(body || '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  const i = lower.indexOf(q);
  if(i === -1) return String(html`${raw.slice(0, 90)}`);
  const ctx = 34;
  const start = Math.max(0, i - ctx);
  const end = Math.min(raw.length, i + q.length + ctx);
  const before = raw.slice(start, i);
  const match = raw.slice(i, i + q.length);
  const after = raw.slice(i + q.length, end);
  return (start > 0 ? '…' : '') +
    String(html`${before}<mark>${match}</mark>${after}`) +
    (end < raw.length ? '…' : '');
}

export function authorLabel(m){
  if(m && m.out) return t('common.you');
  const c = S.roster[S.activeChat];
  return (c && (c.nick || c.name)) || nickOf(S.activeChat);
}

// Иконка-заглушка на время (лениво отложенной) расшифровки, либо финальная
// подпись для типов, у которых нет визуального превью (аудио/файл).
// Для стикеров/кружков - своя иконка (см. categoryOf в classify.js), чтобы
// заглушка не выглядела как обычное фото/видео ещё до того, как превью догрузится.
export function thumbFallbackHtml(info){
  const icon = info.category === 'sticker' ? '🏷️' : info.category === 'videonote' ? '⭕'
    : info.kind === 'image' ? '🖼️' : info.kind === 'video' ? '🎬' : info.kind === 'audio' ? '🎤' : '📎';
  return String(html`<span class="search-thumb-fallback">${icon}</span>`);
}

export function mediaLabel(info){
  if(info.kind === 'file') return '📎 ' + fileNameOf(info.url);
  return kindLabelFor(info.kind, info.url);
}
