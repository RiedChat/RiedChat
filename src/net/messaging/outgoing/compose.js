// ===================== net/messaging/outgoing/compose.js =====================
// Логика поля ввода: забирает текст, выбирает обычную отправку или правку (XEP-0308),
// собирает тело ответа с цитатой.
import { $, fireInput } from '../../../core/dom-utils.js';
import { state } from '../../../core/state.js';
import { QUOTE_MARKER, QUOTE_ID_DELIM } from '../../../core/text-patterns.js';
import { renderReplyBar } from '../../../ui/chat-head.js';

import { editMessage } from './edit.js';
import { sendMessage } from './send.js';

// Тело ответа: строки "> ..." (автор + цитата), пустая строка, затем текст. ui/chat-view/render-messages.js
// рисует цитату блоком с полосой слева. QUOTE_MARKER в начале (core/text-patterns.js) - иначе вручную
// набранное "> ..." цитатой не считается.
// replyTo.id (features/message-swipe/quote.js:startReply) невидимо встраивается между QUOTE_ID_DELIM -
// клик по цитате (features/quote-jump.js) находит именно это сообщение, а не текстовое совпадение.
export function buildQuotedBody(replyTo, text){
  // wireAuthor (features/message-swipe/quote.js:startReply) - то, что уходит в ТЕКСТ собеседнику;
  // author - локальная подпись в плашке над полем ввода (ui/chat-head.js:renderReplyBar),
  // может быть "Вы", что собеседнику не подходит.
  const author = (replyTo.wireAuthor || replyTo.author || '').replaceAll('\n', ' ');
  const snippet = (replyTo.text || '').replaceAll('\n', ' ');
  const idPart = replyTo.id ? (QUOTE_ID_DELIM + String(replyTo.id).replaceAll(QUOTE_ID_DELIM, '') + QUOTE_ID_DELIM) : '';
  return QUOTE_MARKER + idPart + '> ' + author + ':\n> ' + snippet + '\n\n' + text;
}

export async function sendCurrentMessage(){
  const input = $('msg-input');
  const body = input.value.trim();
  if(!body || !state.activeChat) return;

  // Очищаем поле один раз ДО await: пока идёт шифрование, пользователь может набрать новый текст.
  input.value = '';
  input.style.height = 'auto';

  // Режим редактирования (features/message-edit.js) - исправление (XEP-0308), state.replyTo/buildQuotedBody не трогаем.
  if(state.editing){
    const targetId = state.editing.id;
    // В поле при редактировании текст БЕЗ цитаты (features/message-edit.js:startEdit) - возвращаем её,
    // иначе правка сотрёт цитату.
    const editedBody = (state.editing.quotePrefix || '') + body;
    const status = await editMessage(state.activeChat, targetId, editedBody);
    if(!status.sent){
      // Не удалось зашифровать (editMessage): на сервер ничего не ушло - возвращаем текст в поле.
      input.value = body;
      fireInput(input);
      return;
    }
    state.editing = null;
    renderReplyBar();
    return;
  }

  const finalBody = state.replyTo ? buildQuotedBody(state.replyTo, body) : body;
  const status = await sendMessage(state.activeChat, finalBody);
  if(!status.sent){
    // Не удалось зашифровать (sendMessage): ничего не ушло, цитата остаётся, текст
    // возвращаем в поле (если за время модалки там нет нового).
    if(!input.value){
      input.value = body;
      fireInput(input);
    }
    return;
  }
  state.replyTo = null;
  renderReplyBar();
}
