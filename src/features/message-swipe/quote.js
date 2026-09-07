import { $, nickOf } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { stripQuotedBody } from '../../core/text-patterns.js';
import { cancelEdit } from '../message-edit.js';
import { KIND_LABEL } from './shared.js';
import { t } from '../../i18n/t.js';
import { classifySingleMedia } from '../../ui/chat-view/message-body-html.js';

const S = state;

// ---------- действие: свайп справа налево -> цитировать ----------
export function startReply(msg, bubble){
  // Цитирование и редактирование взаимоисключающи - если сейчас редактируется
  // другое сообщение, сбрасываем это состояние (вместе с текстом в поле ввода),
  // прежде чем открыть цитату (см. features/message-edit.js:cancelEdit).
  if(S.editing) cancelEdit();
  // bubble.dataset.kind надёжен ТОЛЬКО для "чистого" медиа-сообщения (см.
  // ui/chat-view/media-loader.js:loadEncryptedMedia - data-kind проставляется
  // лишь при isMediaOnly, т.е. host.classList.contains('media-frame')). Если
  // это медиа-сообщение, отправленное вместе с цитатой (см. net/upload.js:
  // _composeBody), оно рендерится как обычный текстовый пузырь с инлайн-медиа
  // (.media-embed, не .media-frame) - там data-kind никогда не выставляется, и
  // цитирование такого сообщения раньше уходило в текстовую ветку ниже, что
  // при обрезке до 160 символов ломало саму aesgcm://-ссылку. Поэтому при
  // отсутствии надёжного dataset.kind распознаём медиа по самому телу
  // сообщения (без унаследованной цитаты, см. stripQuotedBody ниже) -
  // тем же способом, что и рендер (classifySingleMedia).
  const ownTextForKind = stripQuotedBody(msg.body || '');
  const domKind = bubble.dataset.kind && bubble.dataset.kind !== 'text' ? bubble.dataset.kind : null;
  const detectedMedia = domKind ? null : classifySingleMedia(ownTextForKind);
  const kind = domKind || (detectedMedia && detectedMedia.kind);
  const contact = S.roster[S.activeChat];
  // Везде в интерфейсе (ростер, шапка чата, звонки) актуальное отображаемое
  // имя - это contact.nick (текущий ник контакта), а contact.name - лишь
  // изначальное имя, под которым контакт был добавлен, и оно не меняется
  // (см. net/roster.js). Раньше здесь бралось только contact.name, поэтому
  // при цитировании в тексте цитаты навсегда фиксировалось именно исходное
  // имя, даже если контакт давно сменил ник.
  const author = msg.out ? t('common.you') : ((contact && (contact.nick || contact.name)) || S.activeChat);
  // "Вы" имеет смысл только ЛОКАЛЬНО, в плашке над полем ввода (см.
  // ui/chat-head.js:renderReplyBar) - это же слово ниже (buildQuotedBody в
  // net/messaging/outgoing/compose.js) буквально попадает в ТЕКСТ отправляемого
  // сообщения, то есть уходит и собеседнику. Раньше при цитировании СВОЕГО ЖЕ
  // сообщения автором в отправленный текст так и записывалось "Вы" - и
  // собеседник в чате видел цитату вида "Вы: ...", хотя это сообщение отправили
  // мы, а не он. wireAuthor - то, что реально уйдёт в тело: для своих сообщений
  // это наше отображаемое имя (как везде в интерфейсе выводится JID без
  // домена, см. nickOf), а не локальное местоимение.
  const wireAuthor = msg.out ? (nickOf(S.myBareJid) || author) : author;
  let text;
  if(kind && KIND_LABEL[kind]){
    // Тело медиа-сообщения - это и есть точная ссылка на файл (см.
    // classifySingleMedia) - используем её целиком как текст цитаты, БЕЗ
    // усечения до 160 символов (как в ветке ниже для обычного текста):
    // обрезанная aesgcm://-ссылка не проходит classifySingleMedia на
    // приёмной стороне и рендерится битым текстом вместо превью. Дружелюбную
    // метку вместо сырой ссылки рисуем отдельно при рендере (см.
    // ui/chat-view/message-body-html.js) - то, что реально уходит в тело
    // сообщения (text здесь), при этом не меняется. ownTextForKind - тело
    // БЕЗ унаследованной цитаты (см. комментарий про domKind/stripQuotedBody выше).
    text = ownTextForKind.trim();
  } else {
    // msg.body здесь может САМ быть ответом на ответ, т.е. уже содержать
    // свой ведущий блок "> автор:\n> текст\n\n" (см. buildQuotedBody в
    // net/messaging/outgoing.js). Без этой очистки новая цитата собиралась
    // бы поверх старой и при каждом следующем ответе в цепочке "> " накапливались
    // вложенно ("ты > сказал > это" вместо текста последнего сообщения) -
    // отрезаем чужой блок цитаты и берём только реальный текст ЭТОГО сообщения
    // (ownTextForKind - тот же stripQuotedBody, вычислен выше).
    const raw = ownTextForKind.replace(/\s+/g, ' ').trim();
    text = raw.length > 160 ? raw.slice(0, 160) + '…' : raw;
  }
  // kind сохраняем отдельно от текста, чтобы плашка "Ответ ..." над полем
  // ввода (см. ui/chat-head.js:renderReplyBar) могла показать дружелюбную
  // метку ("📎 Файл" и т.п.), а не голую ссылку, которая как раз и лежит в
  // text ниже - она нужна именно как ссылка при сборке тела сообщения
  // (см. net/messaging/outgoing/compose.js:buildQuotedBody).
  S.replyTo = { author, wireAuthor, text, id: msg.id, kind: (kind && KIND_LABEL[kind]) ? kind : null };
  renderReplyBar();
  if(navigator.vibrate) navigator.vibrate(12);
  const input = $('msg-input');
  if(input) input.focus();
}
