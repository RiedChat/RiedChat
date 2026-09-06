// ===================== features/swipe-settings.js =====================
// Настройка направления свайпа по сообщению (localStorage, на устройство -
// как и шрифт в features/font-settings/, это предпочтение конкретного
// устройства/руки пользователя, а не аккаунта). UI - чекбокс в модалке
// профиля. Читается из features/message-swipe.js при навешивании жеста.
import { lsGet, lsSet } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';

const KEY = 'xmppChatSwipeReversed';

// false (по умолчанию) - как в Telegram: свайп справа налево -> цитировать,
// слева направо -> копировать/скачивать.
// true - реверс (удобно, например, при работе в RTL-раскладке/интерфейсе):
// свайп слева направо -> цитировать, справа налево -> копировать/скачивать.
export function loadSwipeReversed(){
  return lsGet(KEY, false);
}
export function saveSwipeReversed(reversed){
  lsSet(KEY, !!reversed);
}

// Проставляет чекбокс модалки профиля из сохранённых настроек.
export function openInModal(){
  $('swipe-reversed-toggle').checked = loadSwipeReversed();
}
// Читает чекбокс модалки профиля и сохраняет.
export function commit(){
  saveSwipeReversed($('swipe-reversed-toggle').checked);
}
