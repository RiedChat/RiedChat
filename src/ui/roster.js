// ===================== ui/roster.js =====================
// Рендер списка контактов (ростера) в сайдбаре.
import { $, isUnread, nickOf, contactName } from '../core/dom-utils.js';
import { ICON_LOCK_CLOSED } from '../core/icons.js';
import { cx, html, raw, setHTML } from '../core/safe-html.js';
import { state, messagesOf } from '../core/state.js';
import { splitQuotedBody } from '../core/text-patterns.js';
import { omemo } from '../crypto/omemo/state.js';
import { t } from '../i18n/t.js';

import { mediaLabelFor } from './chat-view/message-body-html.js';
import { contactAvatarHtml } from './contact-view.js';

// Текст превью последнего сообщения: снимает блок цитаты (">author:\n>текст\n\n", core/text-patterns.js), заменяет ссылки на медиа меткой; если своего текста не осталось (ответ на медиа без подписи) - показывает, на что отвечали.
function previewText(lastMsg){
  const quoteSplit = splitQuotedBody(lastMsg.body);
  const body = (quoteSplit?.rest ?? lastMsg.body ?? '').trim();
  const label = mediaLabelFor(body);
  if(label) return label;
  if(body) return body;
  if(quoteSplit) return t('roster.quotedPrefix', { quoted: quoteSplit.quoted });
  return t('roster.fileFallback');
}

const sortedRosterJids = () =>
  Object.keys(state.roster).sort((a, b) => contactName(a).localeCompare(contactName(b)));

// Готовая строка ростера для одного jid (без вставки в DOM) - общая часть renderRoster() и patchRosterRow().
function buildRosterRow(jid){
  const c = state.roster[jid];
  const row = document.createElement('div');
  row.className = 'roster-item' + (state.activeChat === jid ? ' active' : '');
  row.dataset.jid = jid;
  const msgs = messagesOf(jid);
  const lastMsg = msgs.at(-1);
  // Замок - только при подтверждённом OMEMO (chatSupport[jid] === true); false и undefined (disco#info не проверялся) не различаем (в отличие от бейджа в шапке, chat-head.js:updateOmemoBadge).
  const lockBadge = omemo.chatSupport[jid] === true
    ? html` <span title="${t('roster.omemoAvailableTitle')}">${raw(ICON_LOCK_CLOSED)}</span>`
    : '';
  const sub = lastMsg ? (lastMsg.out ? t('roster.youPrefix') : '') + previewText(lastMsg) : nickOf(jid);
  // Непрочитанные - входящие с read===false (net/messaging/incoming.js). Записи без поля read считаются прочитанными.
  const unreadCount = msgs.filter(isUnread).length;
  const unreadBadge = unreadCount
    ? html`<div class="roster-unread">${unreadCount > 99 ? '99+' : String(unreadCount)}</div>`
    : '';
  setHTML(row, html`
    <div class="avatar">${contactAvatarHtml(c, jid)}</div>
    <div class="${cx('presence-dot', c.presence === 'online' && 'online')}"></div>
    <div class="roster-meta">
      <div class="roster-name">${contactName(jid)}${lockBadge}</div>
      <div class="roster-sub">${sub}</div>
    </div>
    ${unreadBadge}`);
  return row;
}

// Один делегированный клик-обработчик на весь #roster (строки пересоздаются). openChat передаётся из app.js, а не импортом: app.js импортирует ui/*, прямой импорт дал бы цикл.
export function onRosterOpen(openChat){
  $('roster').onclick = e => {
    const row = e.target.closest('.roster-item');
    if(row) openChat(row.dataset.jid);
  };
}

export function renderRoster(){
  const el = $('roster');
  const list = sortedRosterJids();
  if(list.length === 0){
    setHTML(el, html`<div class="roster-empty">${raw(t('sidebar.rosterEmptyHtml'))}</div>`);
    return;
  }
  el.replaceChildren(...list.map(buildRosterRow));
}

// Перерисовывает одну строку ростера (аватар/превью/бейдж непрочитанных/замок) вместо полной пересборки: раньше прочтение чата (unread-tracking.js:markChatRead) или одно сообщение вызывали renderRoster() с пересозданием всех строк. Порядок зависит только от имени (sortedRosterJids), поэтому замена на месте сортировку не портит. Если строки нет в DOM (новый контакт, пустой ростер) - полный renderRoster().
export function patchRosterRow(jid){
  const el = $('roster');
  const existing = el.querySelector('.roster-item[data-jid="' + CSS.escape(jid) + '"]');
  if(!existing){ renderRoster(); return; }
  existing.replaceWith(buildRosterRow(jid));
}
