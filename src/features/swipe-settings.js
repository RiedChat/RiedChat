// ===================== features/swipe-settings.js =====================
// Настройка направления свайпа по сообщению (localStorage, на устройство -
// как и шрифт в features/font-settings/, это предпочтение конкретного
// устройства/руки пользователя, а не аккаунта). UI - чекбокс в модалке
// профиля. Читается из features/message-swipe.js при навешивании жеста.
import { lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

const KEY = 'xmppChatSwipeReversed';
const BIDI_QUOTE_KEY = 'xmppChatSwipeBidiQuote';

// false (по умолчанию) - как в Telegram: свайп справа налево -> цитировать,
// слева направо -> копировать/скачивать.
// true - реверс (удобно, например, при работе в RTL-раскладке/интерфейсе):
// свайп слева направо -> цитировать, справа направо -> копировать/скачивать.
export function loadSwipeReversed(){
  return lsGet(KEY, false);
}
export function saveSwipeReversed(reversed){
  lsSet(KEY, !!reversed);
}

// "Двунаправленная цитата" - заменяет копирование/скачивание на цитату в
// обоих направлениях свайпа: оба свайпа (и вправо, и влево) вызывают
// startReply (см. message-swipe/wire.js). Настройка "Реверс направления
// свайпа" при этом теряет смысл (обе стороны и так делают одно и то же) -
// wire.js проверяет loadBidiQuote() раньше loadSwipeReversed().
export function loadBidiQuote(){
  return lsGet(BIDI_QUOTE_KEY, false);
}
export function saveBidiQuote(enabled){
  lsSet(BIDI_QUOTE_KEY, !!enabled);
}

// Проставляет чекбоксы модалки профиля из сохранённых настроек.
export function openInModal(){
  $('swipe-reversed-toggle').checked = loadSwipeReversed();
  $('swipe-bidi-quote-toggle').checked = loadBidiQuote();
}
// Читает чекбоксы модалки профиля и сохраняет.
export function commit(){
  saveSwipeReversed($('swipe-reversed-toggle').checked);
  saveBidiQuote($('swipe-bidi-quote-toggle').checked);
}
