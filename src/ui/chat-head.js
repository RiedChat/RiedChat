// ===================== ui/chat-head.js =====================
// Шапка чата, OMEMO-бейдж и плашка «Ответ ...». Зависит только от state.activeChat/roster/replyTo.
import { $, formatLastSeen, contactName } from '../core/dom-utils.js';
import { ICON_LOCK_CLOSED, ICON_LOCK_OPEN } from '../core/icons.js';
import { html, raw, setHTML } from '../core/safe-html.js';
import { state, activeMessages } from '../core/state.js';
import { collapseWs } from '../core/text-patterns.js';
import { omemo } from '../crypto/omemo/state.js';
import { mediaLabel } from '../features/message-swipe/shared.js';
import { t } from '../i18n/t.js';

import { contactAvatarHtml } from './contact-view.js';

// ---------- CHAT HEAD ----------
export function renderChatHead(){
  const c = state.roster[state.activeChat] || {};
  setHTML($('chat-avatar'), contactAvatarHtml(c, state.activeChat));
  $('chat-name').textContent = contactName(state.activeChat);
  $('chat-sub').textContent = c.presence === 'online' ? t('chatHead.online') : (formatLastSeen(c.lastSeen) || t('chatHead.offline'));
  updateOmemoBadge();
}

export function updateOmemoBadge(){
  const badge = $('omemo-badge');
  if(!badge) return;
  badge.hidden = !state.activeChat;
  if(!state.activeChat) return;
  const support = omemo.chatSupport[state.activeChat];
  // Замок: закрыт - OMEMO активен для чата, открыт - во всех остальных случаях (отправка при этом заблокирована).
  const [className, lockIcon, labelKey] =
    !omemo.ready ? ['omemo-badge unavailable', ICON_LOCK_OPEN, 'chatHead.encryptionUnavailable']
    : support === false ? ['omemo-badge unavailable', ICON_LOCK_OPEN, 'chatHead.noOmemo']
    : ['omemo-badge', ICON_LOCK_CLOSED, 'chatHead.omemoOn'];
  badge.className = className;
  setHTML(badge, html`${raw(lockIcon)} ${t(labelKey)}`);
}

// Плашка над полем ввода: state.replyTo (свайп) или state.editing (двойной тап/колёсико) - взаимоисключающие, меняются заголовок и превью.
function editBarMode(){
  const original = activeMessages().find(m => m?.id === state.editing.id);
  return {
    titleKey: 'chatHead.cancelEditTitle',
    verbKey: 'chatHead.editVerb',
    author: '',
    text: collapseWs(original?.body),
  };
}

function replyBarMode(){
  const reply = state.replyTo;
  return {
    titleKey: 'chatHead.cancelReplyTitle',
    verbKey: 'chatHead.replyVerb',
    author: reply ? reply.author : '',
    // Для медиа state.replyTo.text - сырая ссылка (нужна для тела ответа); в превью подменяем на метку, как в цитате (message-body-html.js).
    text: reply ? (reply.kind ? mediaLabel(reply.kind, reply.text) : reply.text) : '',
  };
}

export function renderReplyBar(){
  const bar = $('reply-bar');
  if(!bar) return;
  const editing = !!state.editing;
  const mode = editing ? editBarMode() : replyBarMode();
  bar.hidden = !(editing || state.replyTo);
  bar.classList.toggle('editing', editing);
  bar.title = t(mode.titleKey);
  $('reply-bar-verb').textContent = t(mode.verbKey);
  $('reply-bar-author').textContent = mode.author;
  $('reply-bar-text').textContent = mode.text;
}
