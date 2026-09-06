// ===================== features/quote-jump.js =====================
// Клик по блоку цитаты внутри пузыря (см. ui/chat-view/message-body-html.js)
// -> прокрутка к процитированному сообщению и его временная подсветка.
// Протокол текстовый (см. net/messaging/outgoing.js:buildQuotedBody) - id
// оригинального сообщения в теле не передаётся, поэтому ищем совпадение в
// истории текущего чата по автору (свой/чужой, см. data-quote-author) и
// нормализованному тексту (data-quote-text), той же нормализацией, что
// строит сниппет цитаты в features/message-swipe.js:startReply().
import { $ } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { stripQuotedBody } from '../core/text-patterns.js';
import { media } from '../net/media.js';
import { KIND_LABEL } from './message-swipe.js';
import { t } from '../i18n/t.js';

const S = state;
const HIGHLIGHT_MS = 1600;
const HIGHLIGHT_CLASS = 'search-highlight'; // тот же класс и анимация (search-flash, см. css/modals.css), что при переходе из поиска (features/message-search.js:scrollToMessage)

// Обратная карта KIND_LABEL ('📷 Фото' -> 'image' и т.п.) - цитата медиа-
// сообщения хранит в теле именно эту метку (см. message-swipe.js:startReply),
// а не реальный текст сообщения (для медиа его и нет - там ссылка на файл).
const LABEL_TO_KIND = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k]));

function normalize(body){
  return stripQuotedBody(body || '').replace(/\s+/g, ' ').trim();
}

// Тело сообщения-медиа - голая aesgcm://-ссылка на файл (см.
// net/message-body-parser.js:parseMessageBody) - определяем её тип тем же
// способом, что и остальной код (net/media.js), а не текстом.
function mediaKindOf(body){
  const trimmed = String(body || '').trim();
  const m = trimmed.match(media.AESGCM_RE);
  if(m && m.length === 1 && m[0] === trimmed) return media.kindOf(media.extOf(trimmed));
  return null;
}

// quoteText мог быть обрезан до 160 символов с "…" (см. message-swipe.js) -
// тогда сравниваем префиксом, иначе - точным совпадением.
//
// Если quoteText сам похож на ссылку на медиафайл (для медиа-цитат
// startReply() кладёт в тело именно её, целиком, без усечения - см.
// message-swipe.js), сравниваем ПОБАЙТОВО с телом целевого сообщения: это
// однозначно определяет ИМЕННО то фото/видео/голосовое, а не любое другой
// той же природы в чате.
//
// LABEL_TO_KIND - обратная совместимость со СТАРЫМИ цитатами медиа (уже
// отправленными до этого исправления - своими из локальной истории или
// от собеседника с ещё не обновлённым клиентом), которые хранят только
// общую метку вида "📷 Фото"/"🎤 Голосовое сообщение" без ссылки на файл -
// для них по-прежнему можно сверить только тип файла, точное сообщение
// принципиально не определить.
function bodyMatchesQuote(body, quoteText){
  if(mediaKindOf(quoteText)) return String(body || '').trim() === quoteText.trim();
  const kind = LABEL_TO_KIND[quoteText];
  if(kind) return mediaKindOf(body) === kind;
  const norm = normalize(body);
  if(quoteText.endsWith('…')) return norm.startsWith(quoteText.slice(0, -1));
  return norm === quoteText;
}

// Ищет индекс процитированного сообщения в list: сперва назад от текущего
// (обычный случай - ответ на более раннее сообщение), затем вперёд (на
// случай истории, дописанной не строго по порядку).
function findQuotedIndex(list, fromIdx, isOut, quoteText){
  for(let i = fromIdx - 1; i >= 0; i--){
    const m = list[i];
    if(m && !!m.out === isOut && bodyMatchesQuote(m.body, quoteText)) return i;
  }
  for(let i = fromIdx + 1; i < list.length; i++){
    const m = list[i];
    if(m && !!m.out === isOut && bodyMatchesQuote(m.body, quoteText)) return i;
  }
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
    const list = S.messages[S.activeChat] || [];
    // Если в теле есть встроенный id процитированного сообщения (см.
    // core/text-patterns.js:QUOTE_ID_DELIM) - ищем ТОЧНО по нему, это
    // однозначно определяет нужное сообщение даже при текстовых дублях
    // (два одинаковых "тест" в чате). id может отсутствовать у истории,
    // отправленной до этого изменения, или у сообщений от собеседника на
    // не обновлённом клиенте - тогда падаем на старый эвристический поиск
    // по тексту/автору/близости.
    const quoteId = quoteEl.dataset.quoteId || '';
    let targetIdx = quoteId ? list.findIndex(m => m && m.id === quoteId) : -1;
    if(targetIdx === -1) targetIdx = findQuotedIndex(list, fromIdx, isOut, quoteText);
    if(targetIdx === -1) return; // не нашли - например, сообщение ещё не догружено из MAM-истории
    const targetRow = el.querySelector(`.msg-row[data-idx="${targetIdx}"]`);
    if(!targetRow) return;
    targetRow.scrollIntoView({block: 'center', behavior: 'smooth'});
    // Сброс перед повторным добавлением - если кликнули по другой цитате,
    // ведущей туда же, пока предыдущая подсветка ещё не погасла, анимация
    // должна перезапуститься, а не просто продолжиться с середины.
    targetRow.classList.remove(HIGHLIGHT_CLASS);
    void targetRow.offsetWidth; // форсируем reflow, чтобы re-add класса перезапустил CSS-анимацию
    targetRow.classList.add(HIGHLIGHT_CLASS);
    setTimeout(() => targetRow.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
  });
}
