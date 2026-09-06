import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderReplyBar } from '../../ui/chat-head.js';
import { stripQuotedBody } from '../../core/text-patterns.js';
import { cancelEdit } from '../message-edit.js';
import { KIND_LABEL } from './shared.js';
import { t } from '../../i18n/t.js';

const S = state;

// ---------- действие: свайп справа налево -> цитировать ----------
export function startReply(msg, bubble){
  // Цитирование и редактирование взаимоисключающи - если сейчас редактируется
  // другое сообщение, сбрасываем это состояние (вместе с текстом в поле ввода),
  // прежде чем открыть цитату (см. features/message-edit.js:cancelEdit).
  if(S.editing) cancelEdit();
  const kind = bubble.dataset.kind;
  const contact = S.roster[S.activeChat];
  // Везде в интерфейсе (ростер, шапка чата, звонки) актуальное отображаемое
  // имя - это contact.nick (текущий ник контакта), а contact.name - лишь
  // изначальное имя, под которым контакт был добавлен, и оно не меняется
  // (см. net/roster.js). Раньше здесь бралось только contact.name, поэтому
  // при цитировании в тексте цитаты навсегда фиксировалось именно исходное
  // имя, даже если контакт давно сменил ник.
  const author = msg.out ? t('common.you') : ((contact && (contact.nick || contact.name)) || S.activeChat);
  let text;
  if(kind && KIND_LABEL[kind]){
    // Тело медиа-сообщения - это и есть точная ссылка на файл (см.
    // net/media.js/classifySingleMedia) - используем её целиком как текст
    // цитаты, БЕЗ усечения до 160 символов (как в ветке ниже для обычного
    // текста). Раньше тут писалась только общая метка вида "📷 Фото", из-за
    // чего клик по такой цитате (features/quote-jump.js) не мог отличить
    // ЭТО фото от любого другого фото/видео/голосового в чате того же типа
    // и переходил к произвольному (обычно ближайшему/последнему) совпадению.
    // Дружелюбную метку вместо сырой ссылки рисуем отдельно при рендере
    // (см. ui/chat-view/message-body-html.js) - то, что реально уходит в
    // тело сообщения, при этом не меняется.
    text = (msg.body || '').trim();
  } else {
    // msg.body здесь может САМ быть ответом на ответ, т.е. уже содержать
    // свой ведущий блок "> автор:\n> текст\n\n" (см. buildQuotedBody в
    // net/messaging/outgoing.js). Без этой очистки новая цитата собиралась
    // бы поверх старой и при каждом следующем ответе в цепочке "> " накапливались
    // вложенно ("ты > сказал > это" вместо текста последнего сообщения) -
    // отрезаем чужой блок цитаты и берём только реальный текст ЭТОГО сообщения.
    const ownText = stripQuotedBody(msg.body || '');
    const raw = ownText.replace(/\s+/g, ' ').trim();
    text = raw.length > 160 ? raw.slice(0, 160) + '…' : raw;
  }
  // kind сохраняем отдельно от текста, чтобы плашка "Ответ ..." над полем
  // ввода (см. ui/chat-head.js:renderReplyBar) могла показать дружелюбную
  // метку ("📎 Файл" и т.п.), а не голую ссылку, которая как раз и лежит в
  // text ниже - она нужна именно как ссылка при сборке тела сообщения
  // (см. net/messaging/outgoing/compose.js:buildQuotedBody).
  S.replyTo = { author, text, id: msg.id, kind: (kind && KIND_LABEL[kind]) ? kind : null };
  renderReplyBar();
  if(navigator.vibrate) navigator.vibrate(12);
  const input = $('msg-input');
  if(input) input.focus();
}
