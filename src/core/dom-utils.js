// ===================== core/dom-utils.js =====================
// Мелкие переиспользуемые утилиты: доступ к DOM, тосты, экранирование HTML.
import { t } from '../i18n/t.js';

export const $ = (id) => document.getElementById(id);

export function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast._h);
  toast._h = setTimeout(() => el.style.display = 'none', 3500);
}

export function initials(jid){
  const local = jid.split('@')[0] || jid;
  return local.slice(0,2).toUpperCase();
}

// Ник контакта без "@domain" - используется везде, где JID показывается
// пользователю (ростер, шапка чата), чтобы домен нигде не был виден.
export function nickOf(jid){
  return String(jid || '').split('@')[0];
}

// "сегодня" / "вчера" / "позавчера", а для более старых дат - дд.мм.гггг.
// Общая логика для разделителей дней в чате (ui/chat-view/render-messages.js:renderMessages)
// и для строки "был(а) ..." в шапке чата (ui/chat-head.js:renderChatHead).
export function relativeDayLabel(date){
  const pad2 = n => String(n).padStart(2, '0');
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000);
  if(diffDays === 0) return t('dates.today');
  if(diffDays === 1) return t('dates.yesterday');
  if(diffDays === 2) return t('dates.dayBeforeYesterday');
  return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

// "был(а) 15:55 сегодня" / "был(а) 15:55 вчера" / "был(а) 15:55 позавчера" /
// "был(а) 12.07.2026" - время последнего визита контакта, показывается в
// шапке чата, когда контакт сейчас не в сети (см. lastSeen в core/state.js).
// Возвращает null, если время последнего визита ещё неизвестно (например,
// контакт ни разу не заходил в сеть за эту сессию клиента).
export function formatLastSeen(ts){
  if(!ts) return null;
  const d = new Date(ts);
  const label = relativeDayLabel(d);
  if(label === t('dates.today') || label === t('dates.yesterday') || label === t('dates.dayBeforeYesterday')){
    const pad2 = n => String(n).padStart(2, '0');
    const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return t('dates.lastSeenPrefix', { value: time + ' ' + label });
  }
  return t('dates.lastSeenPrefix', { value: label }); // label уже в формате дд.мм.гггг
}

export function escapeHtml(s){
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Стандартное поведение модалки: закрытие по крестику (closeBtnId, опционален)
// и по клику на затемнённый фон вне modal-box. Раньше эта пара обработчиков
// была продублирована вручную для fp-modal/add-modal/profile-modal/search-modal.
// Возвращает функцию close(), чтобы вызывающий код мог закрыть модалку и из
// других мест (например, после успешного сохранения формы внутри неё).
export function wireModalDismiss(modalId, closeBtnId){
  const modal = $(modalId);
  if(!modal) return () => {};
  const close = () => modal.classList.remove('active');
  if(closeBtnId){
    const btn = $(closeBtnId);
    if(btn) btn.addEventListener('click', close);
  }
  modal.addEventListener('click', (e) => { if(e.target === modal) close(); });
  return close;
}

// Разбирает строку XML в DOM-элемент (нужно, например, чтобы вставить готовый
// XML-фрагмент внутрь станзы, которую строит Strophe).
export function _parseXml(str){
  const doc = new DOMParser().parseFromString(str, 'text/xml');
  return doc.documentElement;
}
