// ===================== net/messaging/outgoing/compose.js =====================
// Логика, привязанная к полю ввода: забирает текст, решает - обычная отправка
// или сохранение правки (XEP-0308) - и собирает тело сообщения-ответа с цитатой.
import { $ } from '../../../core/dom-utils.js';
import { state } from '../../../core/state.js';
import { renderReplyBar } from '../../../ui/chat-head.js';
import { QUOTE_MARKER, QUOTE_ID_DELIM } from '../../../core/text-patterns.js';
import { sendMessage } from './send.js';
import { editMessage } from './edit.js';
import { notifyEncryptionFallback } from './fallback-notify.js';

const S = state;

// Собирает тело сообщения-ответа: пара строк "> ..." (автор + цитата), пустая
// строка-разделитель, затем сам текст. ui/chat-view/render-messages.js:renderMessages() при
// рендере ищет этот же формат и рисует цитату отдельным блоком с полосой слева.
// QUOTE_MARKER в начале - см. core/text-patterns.js: без него текст, вручную
// набранный пользователем в виде "> ...", цитатой не считается.
// replyTo.id (если есть - см. features/message-swipe/quote.js:startReply) -
// id процитированного сообщения, встраивается невидимо между QUOTE_ID_DELIM,
// чтобы клик по цитате (features/quote-jump.js) находил именно его, а не
// произвольное текстуально совпадающее сообщение (см. text-patterns.js).
export function buildQuotedBody(replyTo, text){
  // wireAuthor (если задан - см. features/message-swipe/quote.js:startReply) -
  // именно то, что должно уйти в ТЕКСТ сообщения собеседнику; author - то, что
  // показывается ЛОКАЛЬНО в плашке над полем ввода (см. ui/chat-head.js:
  // renderReplyBar) и может быть локальным местоимением ("Вы"), которое для
  // собеседника не имеет смысла (он не "вы", а получатель нашего сообщения).
  const author = (replyTo.wireAuthor || replyTo.author || '').replace(/\n/g, ' ');
  const snippet = (replyTo.text || '').replace(/\n/g, ' ');
  const idPart = replyTo.id ? (QUOTE_ID_DELIM + String(replyTo.id).replace(new RegExp(QUOTE_ID_DELIM, 'g'), '') + QUOTE_ID_DELIM) : '';
  return QUOTE_MARKER + idPart + '> ' + author + ':\n> ' + snippet + '\n\n' + text;
}

export async function sendCurrentMessage(){
  const input = $('msg-input');
  const body = input.value.trim();
  if(!body || !S.activeChat) return;

  // Режим редактирования (features/message-edit.js) - отправляем не новое
  // сообщение, а исправление уже отправленного (XEP-0308), и не трогаем
  // S.replyTo/buildQuotedBody, которые относятся только к обычной отправке.
  if(S.editing){
    const targetId = S.editing.id;
    // В поле ввода при редактировании лежит текст БЕЗ блока цитаты (см.
    // features/message-edit.js:startEdit) - возвращаем цитату на место перед
    // отправкой, иначе правка стёрла бы её из сообщения.
    const editedBody = (S.editing.quotePrefix || '') + body;
    input.value = '';
    input.style.height = 'auto';
    const status = await editMessage(S.activeChat, targetId, editedBody);
    if(!status.sent){
      // Пользователь отказался отправлять незашифрованным (см. editMessage) -
      // ничего не ушло на сервер, возвращаем текст в поле ввода, чтобы не потерять правку.
      input.value = body;
      input.dispatchEvent(new Event('input', {bubbles:true}));
      return;
    }
    S.editing = null;
    renderReplyBar();
    return;
  }

  input.value = '';
  input.style.height = 'auto';
  const finalBody = S.replyTo ? buildQuotedBody(S.replyTo, body) : body;
  const status = await sendMessage(S.activeChat, finalBody);
  if(!status.sent){
    // Пользователь отказался отправлять незашифрованным (см. sendMessage) - ничего не
    // ушло на сервер, поле ввода и цитата остаются как были, чтобы текст не потерялся.
    return;
  }
  input.value = '';
  input.style.height = 'auto';
  S.replyTo = null;
  renderReplyBar();
  notifyEncryptionFallback(status.fallbackReason);
}
