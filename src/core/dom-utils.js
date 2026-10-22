// ===================== core/dom-utils.js =====================
// Мелкие переиспользуемые утилиты: доступ к DOM, тосты, экранирование HTML.
import { t, getLocale } from '../i18n/t.js';

import { state } from './state.js';

export const $ = (id) => document.getElementById(id);

// Программно изменили input.value - сообщаем обработчикам (автоподгон высоты, кнопка отправки и т.п.).
export const fireInput = (el) => el.dispatchEvent(new Event('input', {bubbles: true}));

// media.play() без реакции на отказ (autoplay-политика, прерванный load): промис игнорируем.
export const playQuietly = (media) => { media.play().catch(() => {}); };

// Пользователь уже залогинен - главный экран приложения показан.
export const isAppActive = () => $('app').classList.contains('active');

const pad2 = (n) => String(n).padStart(2, '0');

export const clamp01 = x => Math.min(1, Math.max(0, x));

// Секунды -> "m:ss"; нечисловое/отрицательное -> "0:00".
export function formatMmSs(seconds){
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(total / 60) + ':' + pad2(total % 60);
}

// Входящее непрочитанное сообщение (старые записи без поля read считаются прочитанными).
export const isUnread = m => !!m && !m.out && m.read === false;

// Показывает <dialog> модально: Escape, Tab-цикл, фон и возврат фокуса делает браузер. Promise резолвится returnValue диалога
// (value нажатой кнопки <form method="dialog">; 'cancel' - клик по ::backdrop; '' - Escape).
export function showDialog(dlg){
  dlg.returnValue = ''; // иначе после Escape останется значение прошлого открытия
  wireModalDismiss(dlg.id);
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
  });
}

// Кнопка -> input.click() -> change: файлы в onFiles. value сбрасывается, чтобы повторный выбор тех же файлов
// срабатывал. btnId может быть null.
export function wireFilePicker(btnId, inputId, onFiles){
  const input = $(inputId);
  if(btnId) $(btnId).addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if(files.length) onFiles(files);
  });
}

// Прокрутка к строке и временная подсветка (search-flash, css/modals.css); reflow перезапускает анимацию.
export function highlightRow(row){
  row.scrollIntoView({block: 'center', behavior: 'smooth'});
  row.classList.remove('search-highlight');
  void row.offsetWidth;
  row.classList.add('search-highlight');
  setTimeout(() => row.classList.remove('search-highlight'), 1600);
}

// Пользователь у низа списка (допуск px на субпиксели/инерцию)? Проверять ДО изменения высоты.
export const isNearBottom = (el, px = 48) => (el.scrollHeight - el.scrollTop - el.clientHeight) <= px;

export const scrollToBottom = (el) => { el.scrollTop = el.scrollHeight; };

// Не перетягивает фокус с textarea на кнопку (иначе мобильный браузер закрывает клавиатуру). preventDefault на
// mousedown click не отменяет.
export function keepFocus(el){
  el.addEventListener('mousedown', (e) => e.preventDefault());
}

let toastTimer;
export function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// debounce для частых событий (presence-бёрсты, ввод): вызывает fn после wait мс тишины.
export const debounce = (fn, wait) => {
  let timer;
  const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(fn, wait, ...args); };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

export const initials = (jid) => (nickOf(jid) || jid).slice(0, 2).toUpperCase();

// Ник без "@domain" для показа пользователю.
export function nickOf(jid){
  return String(jid || '').split('@')[0];
}

// Имя контакта: nick, иначе name, иначе ник из JID.
export function contactName(jid){
  const c = state.roster[jid];
  return c?.nick || c?.name || nickOf(jid);
}

const dayDiff = (date) =>
  Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);

// Сегодня, вчера, позавчера: подпись даёт Intl ("сегодня"/"вчера"/"позавчера", "2 days ago"), старше - локальная дата.
const isRecentDay = (diff) => diff >= 0 && diff <= 2;

export function relativeDayLabel(date){
  const diff = dayDiff(date);
  return isRecentDay(diff)
    ? new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(-diff, 'day')
    : date.toLocaleDateString(getLocale());
}

export function formatLastSeen(ts){
  if(!ts) return null;
  const d = new Date(ts);
  const time = isRecentDay(dayDiff(d)) ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' : '';
  return t('dates.lastSeenPrefix', { value: time + relativeDayLabel(d) });
}

// Закрытие <dialog> по крестику (closeBtnId опционален) и клику по фону (e.target === dlg: у <dialog> нет padding,
// вся видимая коробка - дочерний .modal-box). Возвращает close() для закрытия из другого кода.
// Присваивание onclick идемпотентно: повторный вызов (showDialog) не плодит обработчики.
export const wireModalDismiss = (id, closeBtnId) => {
  const dlg = $(id);
  if(!dlg) return () => {};
  dlg.onclick = (e) => { if(e.target === dlg) dlg.close('cancel'); };
  if(closeBtnId) $(closeBtnId)?.addEventListener('click', () => dlg.close());
  return () => dlg.close();
};

// Парсит XML-строку в DOM-элемент (для вставки фрагмента в станзу Strophe).
export const parseXml = (str) => new DOMParser().parseFromString(str, 'text/xml').documentElement;
