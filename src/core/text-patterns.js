// ===================== core/text-patterns.js =====================
// Регулярки разбора обычного текста сообщения: голые ссылки и ссылки на картинки (потребитель - ui/chat-view/message-body-html.js).

// Схлопывает пробельные символы в один пробел и обрезает края.
export const collapseWs = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Расширение файла по имени, в нижнем регистре и без точки ('' - если его нет).
export const extOf = (name) =>
  String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

export const URL_RE = /(https?:\/\/[^\s]+)/g;
export const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;

// Ведущий блок цитаты в ответе: строки "> ...", пустая строка, текст (net/messaging/outgoing.js:buildQuotedBody).
// Общий для message-body-html.js и features/message-swipe/quote.js - иначе повторное цитирование копит вложенные цитаты.
//
// QUOTE_MARKER - zero-width space, которым buildQuotedBody помечает свой блок: вручную набранный "> текст" цитатой не станет.
export const QUOTE_MARKER = '\u200B';
// QUOTE_ID_DELIM - необязательный невидимый блок после QUOTE_MARKER с id процитированного сообщения (msg.id):
// quote-jump (features/quote-jump.js) находит именно его, а не любое с тем же текстом. Без id (старая история,
// старые клиенты) - поиск по тексту.
export const QUOTE_ID_DELIM = '\u200C';
const QUOTE_BLOCK_RE = /^\u200B(?:\u200C([^\u200C]*)\u200C)?((?:>[^\n]*\n)+)\n([\s\S]*)$/;

// Возвращает {author, quoted, rest, prefix, id} или null, если цитаты нет. id - id процитированного сообщения
// (см. QUOTE_ID_DELIM) либо null; rest - текст без цитаты; prefix - сырой блок цитаты (с маркером, id и пустой
// строкой): prefix + rest = исходный rawBody, нужно для возврата цитаты при редактировании (features/message-edit.js).
export function splitQuotedBody(rawBody){
  const body = rawBody || '';
  const match = body.match(QUOTE_BLOCK_RE);
  if(!match) return null;
  const [, id = null, quoteBlock, rest] = match;
  const [authorLine, ...quoteLines] = quoteBlock
    .split('\n')
    .filter(Boolean)
    .map(l => l.replace(/^>\s?/, ''));
  return {
    author: (authorLine || '').replace(/:$/, ''),
    quoted: quoteLines.join(' '),
    rest,
    prefix: body.slice(0, body.length - rest.length),
    id,
  };
}

// Тело без ведущего блока цитаты (для новой цитаты/превью нужен только последний текст).
export const stripQuotedBody = (rawBody) => splitQuotedBody(rawBody)?.rest ?? (rawBody || '');
