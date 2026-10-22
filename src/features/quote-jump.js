// ===================== features/quote-jump.js =====================
// Клик по блоку цитаты (ui/chat-view/message-body-html.js) -> прокрутка к процитированному сообщению и подсветка.
// Протокол текстовый (net/messaging/outgoing.js:buildQuotedBody), id оригинала в теле нет, поэтому ищем в истории чата по автору
// (data-quote-author) и нормализованному тексту (data-quote-text), как сниппет в features/message-swipe/quote.js:startReply().
import { $, highlightRow } from '../core/dom-utils.js';
import { activeMessages } from '../core/state.js';
import { stripQuotedBody, collapseWs } from '../core/text-patterns.js';
import { t } from '../i18n/t.js';
import { classifyUrl } from '../net/media/classify.js';
import { ensureMessageRow } from '../ui/chat-view/render-messages.js';

import { kindFromLabel } from './message-swipe/shared.js';

const normalize = (body) => collapseWs(stripQuotedBody(body));

// Тело медиа-сообщения - голая aesgcm://-ссылка (net/message-body-parser.js:parseMessageBody); тип - classifyUrl; открытые ссылки не в счёт.
function mediaKindOf(body){
  const single = classifyUrl(body);
  return single && single.encrypted ? single.kind : null;
}

// quoteText мог быть обрезан до 160 символов с "…" (message-swipe/quote.js) - тогда сравниваем префиксом, иначе точно.
//
// Если quoteText - ссылка на медиафайл (startReply() кладёт её целиком), сравниваем побайтово с телом цели:
// это однозначно определяет именно то фото/видео/голосовое.
//
// kindFromLabel (все локали, метка на языке отправителя) - для СТАРЫХ медиа-цитат с общей меткой вида "📷 Фото" без ссылки:
// сверить можно только тип файла, точное сообщение не определить.
function bodyMatchesQuote(body, quoteText){
  if(mediaKindOf(quoteText)) return String(body || '').trim() === quoteText.trim();
  const kind = kindFromLabel(quoteText);
  if(kind) return mediaKindOf(body) === kind;
  const norm = normalize(body);
  if(quoteText.endsWith('…')) return norm.startsWith(quoteText.slice(0, -1));
  return norm === quoteText;
}

// Ищет индекс процитированного сообщения: сперва назад от текущего (обычно ответ на более раннее), затем вперёд (история могла быть дописана не по порядку).
function findQuotedIndex(list, fromIdx, isOut, quoteText){
  const matches = (i) => {
    const m = list[i];
    return !!m && !!m.out === isOut && bodyMatchesQuote(m.body, quoteText);
  };
  for(let i = fromIdx - 1; i >= 0; i--) if(matches(i)) return i;
  for(let i = fromIdx + 1; i < list.length; i++) if(matches(i)) return i;
  return -1;
}

export function wireQuoteJump(){
  const el = $('messages');
  if(!el) return;
  el.addEventListener('click', (e) => {
    const quoteEl = e.target.closest('.quote-block');
    if(!quoteEl || !el.contains(quoteEl)) return;
    const row = quoteEl.closest('.msg-row');
    if(!row) return;
    const fromIdx = Number(row.dataset.idx);
    if(!Number.isInteger(fromIdx)) return;
    const quoteText = quoteEl.dataset.quoteText || '';
    if(!quoteText) return;
    const isOut = (quoteEl.dataset.quoteAuthor || '') === t('common.you');
    const list = activeMessages();
    // Если в теле есть id процитированного сообщения (core/text-patterns.js:QUOTE_ID_DELIM) - ищем точно по нему (работает и при дублях текста).
    // id нет у старой истории и у сообщений с необновлённого клиента - тогда эвристика по тексту/автору/близости.
    const quoteId = quoteEl.dataset.quoteId || '';
    let targetIdx = quoteId ? list.findIndex(m => m && m.id === quoteId) : -1;
    if(targetIdx === -1) targetIdx = findQuotedIndex(list, fromIdx, isOut, quoteText);
    if(targetIdx === -1) return; // не найдено в локальной истории
    const targetRow = ensureMessageRow(targetIdx);
    if(!targetRow) return;
    highlightRow(targetRow);
  });
}
