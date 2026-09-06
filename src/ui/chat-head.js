// ===================== ui/chat-head.js =====================
// Шапка чата, OMEMO-бейдж и плашка "Ответ ..." (reply bar).
// Выделено из ui/chat-view.js: эта часть не участвует в рендере списка
// сообщений и не зависит от него - только от S.activeChat/S.roster/S.replyTo.
import { $, formatLastSeen, initials, nickOf } from '../core/dom-utils.js';
import { html, raw, setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { mediaLabel } from '../features/message-swipe/shared.js';
import { t } from '../i18n/t.js';
import { ICON_LOCK_CLOSED, ICON_LOCK_OPEN } from '../core/icons.js';

const S = state;

// ---------- CHAT HEAD ----------
export function renderChatHead(){
  const c = S.roster[S.activeChat] || {name: nickOf(S.activeChat)};
  // c.avatarUrl - недоверенный data:-URL из vCard собеседника (см.
  // net/vcard.js) - экранируем через html, а не подставляем в шаблон
  // напрямую (см. ui/roster.js, где та же логика).
  setHTML($('chat-avatar'), c.avatarUrl
    ? html`<img src="${c.avatarUrl}" alt="">`
    : html`${initials(S.activeChat)}`);
  setHTML($('chat-name'), html`${c.nick || c.name || nickOf(S.activeChat)}`);
  if(c.presence === 'online'){
    $('chat-sub').textContent = t('chatHead.online');
  } else {
    $('chat-sub').textContent = formatLastSeen(c.lastSeen) || t('chatHead.offline');
  }
  updateOmemoBadge();
}

export function updateOmemoBadge(){
  const badge = $('omemo-badge');
  if(!badge) return;
  if(!S.activeChat){ badge.style.display = 'none'; return; }
  badge.style.display = 'inline-flex';
  const support = omemo.chatSupport[S.activeChat];
  // Замок в бейдже отражает текущее состояние шифрования: закрытый - когда
  // OMEMO реально активен для этого чата, открытый - во всех остальных
  // случаях (недоступно/нет у собеседника/выключено).
  if(!omemo.ready){
    badge.className = 'omemo-badge unavailable';
    setHTML(badge, html`${raw(ICON_LOCK_OPEN)} ${t('chatHead.encryptionUnavailable')}`);
  } else if(support === false){
    badge.className = 'omemo-badge unavailable';
    setHTML(badge, html`${raw(ICON_LOCK_OPEN)} ${t('chatHead.noOmemo')}`);
  } else if(!omemo.enabled){
    badge.className = 'omemo-badge off';
    setHTML(badge, html`${raw(ICON_LOCK_OPEN)} ${t('chatHead.encryptionOff')}`);
  } else {
    badge.className = 'omemo-badge';
    setHTML(badge, html`${raw(ICON_LOCK_CLOSED)} ${t('chatHead.omemoOn')}`);
  }
}

// Плашка "вернуться к звонку" под шапкой - показывается, только если открыт
// чат ИМЕННО с тем собеседником, с которым сейчас идёт свёрнутый звонок
// (S.call.minimized), см. features/call/call-actions.js:minimizeCall.
// Дёргается из app.js:openChat (при переключении чатов) и из
// ui/call-view.js:renderCallUI (при сворачивании/восстановлении/завершении
// звонка) - оба места меняют то, от чего зависит видимость плашки.
export function renderCallBanner(){
  const banner = $('call-return-banner');
  if(!banner) return;
  const call = S.call;
  const show = !!(call && call.minimized && call.bareJid === S.activeChat);
  banner.hidden = !show;
  if(show){
    $('call-return-banner-text').textContent = call.hasVideo ? t('call.returnBannerVideo') : t('call.returnBannerAudio');
  }
}

// ---------- REPLY BAR (цитирование свайпом / редактирование) ----------
// Показывает/прячет плашку над полем ввода в зависимости от S.replyTo
// (features/message-swipe.js, свайп справа налево) или S.editing
// (features/message-edit.js, двойной тап / клик колёсиком мыши по своему
// сообщению) - эти два состояния взаимоисключающи, но используют одну и ту
// же плашку: меняется только заголовок ("Ответ ..." / "Редактирование") и
// текст-превью.
export function renderReplyBar(){
  const bar = $('reply-bar');
  if(!bar) return;
  if(S.editing){
    bar.style.display = 'flex';
    bar.classList.add('editing');
    bar.title = t('chatHead.cancelEditTitle');
    $('reply-bar-verb').textContent = t('chatHead.editVerb');
    $('reply-bar-author').textContent = '';
    const list = S.messages[S.activeChat] || [];
    const original = list.find(m => m && m.id === S.editing.id);
    $('reply-bar-text').textContent = (original && original.body || '').replace(/\s+/g, ' ').trim();
    return;
  }
  bar.classList.remove('editing');
  bar.title = t('chatHead.cancelReplyTitle');
  if(!S.replyTo){
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  $('reply-bar-verb').textContent = t('chatHead.replyVerb');
  $('reply-bar-author').textContent = S.replyTo.author;
  // Для медиа-сообщений (см. features/message-swipe/quote.js) S.replyTo.text -
  // это сырая ссылка на файл (она нужна как есть при сборке тела ответа), а
  // не то, что стоит показывать человеку в предпросмотре над полем ввода -
  // подменяем на дружелюбную метку так же, как это уже сделано для цитаты
  // внутри уже отправленных сообщений (ui/chat-view/message-body-html.js).
  $('reply-bar-text').textContent = S.replyTo.kind ? mediaLabel(S.replyTo.kind, S.replyTo.text) : S.replyTo.text;
}
