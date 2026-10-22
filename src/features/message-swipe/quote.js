import { $, nickOf, contactName } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { stripQuotedBody, collapseWs } from '../../core/text-patterns.js';
import { t } from '../../i18n/t.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { classifySingleMedia } from '../../ui/chat-view/message-body-html.js';
import { cancelEdit } from '../message-edit.js';

import { isMediaKind } from './shared.js';


// ---------- действие: свайп справа налево -> цитировать ----------
export function startReply(msg, bubble){
  // Цитирование и редактирование взаимоисключающи: сбрасываем текущую правку (features/message-edit.js:cancelEdit).
  if(state.editing) cancelEdit();
  // bubble.dataset.kind надёжен только для "чистого" медиа-сообщения (ui/chat-view/media-loader/encrypted-media.js:loadEncryptedMedia ставит его при isMediaOnly).
  // Медиа с цитатой (net/upload.js:_composeBody) рендерится текстовым пузырём с .media-embed без data-kind, и обрезка до 160 символов ломала aesgcm://-ссылку.
  // Поэтому без dataset.kind определяем медиа по телу без унаследованной цитаты (stripQuotedBody), как рендер (classifySingleMedia).
  const ownTextForKind = stripQuotedBody(msg.body);
  const domKind = bubble.dataset.kind && bubble.dataset.kind !== 'text' ? bubble.dataset.kind : null;
  const detectedMedia = domKind ? null : classifySingleMedia(ownTextForKind);
  const kind = domKind || (detectedMedia && detectedMedia.kind);
  const mediaKind = isMediaKind(kind) ? kind : null;
  // Актуальное имя - contact.nick; contact.name - исходное и не меняется (net/roster.js). Брать нужно nick, иначе в цитате навсегда остаётся старое имя.
  const author = msg.out ? t('common.you') : contactName(state.activeChat);
  // "Вы" - только локально, в плашке (ui/chat-head.js:renderReplyBar); buildQuotedBody (net/messaging/outgoing/compose.js) пишет имя в тело и оно уходит собеседнику,
  // поэтому при цитировании своего сообщения собеседник видел бы "Вы: ...".
  // wireAuthor - имя для тела: для своих сообщений наше отображаемое имя (JID без домена, nickOf), а не местоимение.
  const wireAuthor = msg.out ? (nickOf(state.myBareJid) || author) : author;
  let text;
  if(mediaKind){
    // Тело медиа-сообщения - точная ссылка на файл (classifySingleMedia): берём целиком, БЕЗ усечения до 160 символов -
    // обрезанная aesgcm://-ссылка не распознаётся получателем и рендерится битым текстом.
    // Метку вместо ссылки рисует рендер (ui/chat-view/message-body-html.js), тело (text) не меняется.
    // ownTextForKind - тело без унаследованной цитаты (см. domKind/stripQuotedBody выше).
    text = ownTextForKind.trim();
  } else {
    // msg.body может быть ответом на ответ и уже содержать блок "> автор:\n> текст\n\n" (buildQuotedBody, net/messaging/outgoing.js);
    // без очистки "> " копились бы вложенно. Отрезаем чужую цитату, берём только текст ЭТОГО сообщения (ownTextForKind).
    const raw = collapseWs(ownTextForKind);
    text = raw.length > 160 ? raw.slice(0, 160) + '…' : raw;
  }
  // kind храним отдельно от текста: плашка "Ответ ..." (ui/chat-head.js:renderReplyBar) показывает метку ("📎 Файл"), а text нужен ссылкой для buildQuotedBody (net/messaging/outgoing/compose.js).
  state.replyTo = { author, wireAuthor, text, id: msg.id, kind: mediaKind };
  renderReplyBar();
  if(navigator.vibrate) navigator.vibrate(12);
  const input = $('msg-input');
  if(input) input.focus();
}
