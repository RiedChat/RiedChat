// ===================== ui/roster.js =====================
// Рендер списка контактов (ростера) в сайдбаре.
import { $, escapeHtml, initials, nickOf } from '../core/dom-utils.js';
import { html, raw, setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { openChat } from '../app.js';
import { media } from '../net/media.js';
import { splitQuotedBody } from '../core/text-patterns.js';
import { mediaLabel } from '../features/message-swipe.js';
import { t } from '../i18n/t.js';
import { ICON_LOCK_CLOSED } from '../core/icons.js';

const S = state;

// Тело сообщения-медиа в S.messages - голая ссылка (aesgcm:// зашифрованная
// либо обычная https, см. net/message-body-parser.js), в списке чатов такую
// ссылку показывать нельзя - превращаем в ту же метку, что используется при
// цитировании (features/message-swipe.js:mediaLabel), а не дублируем текст.
function mediaLabelFor(trimmedBody){
  const aes = trimmedBody.match(media.AESGCM_RE);
  if(aes && aes.length === 1 && aes[0] === trimmedBody){
    return mediaLabel(media.kindOf(media.extOf(trimmedBody)), trimmedBody);
  }
  return null;
}

// Строит текст превью последнего сообщения для строки ростера: снимает
// сырой блок цитаты (">author:\n>текст\n\n", см. core/text-patterns.js -
// без этого превью выглядело как "> david: > 📷 Фото в"), заменяет голые
// ссылки на медиа человекочитаемой меткой, и если после снятия цитаты
// собственного текста не осталось (ответили на медиа без подписи) -
// показывает хотя бы то, на что был ответ.
function previewText(lastMsg){
  const rawBody = lastMsg.body || '';
  const quoteSplit = splitQuotedBody(rawBody);
  const body = (quoteSplit ? quoteSplit.rest : rawBody).trim();
  const label = mediaLabelFor(body);
  if(label) return label;
  if(body) return body;
  if(quoteSplit) return t('roster.quotedPrefix', { quoted: quoteSplit.quoted });
  return t('roster.fileFallback');
}

function sortedRosterJids(){
  return Object.keys(S.roster).sort((a,b) => {
    const an = S.roster[a].nick || S.roster[a].name || a;
    const bn = S.roster[b].nick || S.roster[b].name || b;
    return an.localeCompare(bn);
  });
}

// Строит и возвращает готовую строку ростера для одного jid (без вставки в
// DOM) - общая часть для полного renderRoster() и точечного patchRosterRow().
function buildRosterRow(jid){
  const c = S.roster[jid];
  const row = document.createElement('div');
  row.className = 'roster-item' + (S.activeChat === jid ? ' active' : '');
  row.dataset.jid = jid;
  const msgs = S.messages[jid] || [];
  const lastMsg = msgs.length ? msgs[msgs.length-1] : null;
  // Замок в списке чатов показываем только когда OMEMO для контакта точно
  // подтверждён (chatSupport[jid] === true) - при false (точно недоступен)
  // и при undefined (ещё не проверяли disco#info) иконки нет одинаково,
  // это не разные состояния для этой мелкой метки в ростере (в отличие от
  // полноценного бейджа в шапке чата, см. chat-head.js:updateOmemoBadge).
  const lockGlyph = omemo.chatSupport[jid] === true ? ICON_LOCK_CLOSED : '';
  const sub = lastMsg ? (lastMsg.out ? t('roster.youPrefix') : '') + previewText(lastMsg) : nickOf(jid);
  const displayName = c.nick || c.name || nickOf(jid);
  // c.avatarUrl - data:-URL, собранный из vCard СОБЕСЕДНИКА (см.
  // net/vcard.js). Источник уже валидирует MIME/base64, но экранируем
  // ещё раз и здесь (defense in depth: html делает это автоматически
  // для любой подстановки, кроме явно помеченной raw).
  const avatarInner = c.avatarUrl
    ? html`<img src="${c.avatarUrl}" alt="">`
    : raw(escapeHtml(initials(jid)));
  // Непрочитанные - входящие сообщения с read===false (см. net/messaging/incoming.js,
  // net/mam.js). Старые записи без поля read считаются прочитанными.
  const unreadCount = msgs.reduce((n, m) => n + ((!m.out && m.read === false) ? 1 : 0), 0);
  const lockBadge = lockGlyph ? raw(' <span title="' + escapeHtml(t('roster.omemoAvailableTitle')) + '">' + lockGlyph + '</span>') : '';
  const unreadBadge = unreadCount
    ? html`<div class="roster-unread">${unreadCount > 99 ? '99+' : String(unreadCount)}</div>`
    : '';
  setHTML(row, html`
    <div class="avatar">${avatarInner}</div>
    <div class="presence-dot ${raw(c.presence === 'online' ? 'online' : '')}"></div>
    <div class="roster-meta">
      <div class="roster-name">${displayName}${lockBadge}</div>
      <div class="roster-sub">${sub}</div>
    </div>
    ${unreadBadge}`);
  row.addEventListener('click', () => openChat(jid));
  return row;
}

export function renderRoster(){
  const el = $('roster');
  const list = sortedRosterJids();
  if(list.length === 0){
    setHTML(el, html`<div class="roster-empty">${raw(t('sidebar.rosterEmptyHtml'))}</div>`);
    return;
  }
  el.innerHTML = '';
  list.forEach(jid => el.appendChild(buildRosterRow(jid)));
}

// Точечно перерисовывает ОДНУ строку ростера (аватар/превью-текст/бейдж
// непрочитанных/замок) вместо полной пересборки всего сайдбара - раньше
// прочтение одного чата (unread-tracking.js:_markChatRead) или приход
// одного сообщения дёргали renderRoster(), который делает el.innerHTML=''
// и пересоздаёт ВСЕ строки контактов, хотя реально меняется содержимое
// только одной. Порядок строк зависит только от отображаемого имени
// (см. sortedRosterJids), а не от времени последнего сообщения/непрочитанных -
// значит замена одной строки на месте никогда не портит сортировку.
// Если строки ещё нет в DOM (новый контакт, ростер ещё пуст и т.п.) -
// откатываемся на полный renderRoster().
export function patchRosterRow(jid){
  const el = $('roster');
  const existing = el.querySelector('.roster-item[data-jid="' + CSS.escape(jid) + '"]');
  if(!existing){ renderRoster(); return; }
  existing.replaceWith(buildRosterRow(jid));
}
