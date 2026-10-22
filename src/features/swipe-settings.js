// ===================== features/swipe-settings.js =====================
// Направление свайпа (localStorage, на устройство - как шрифт в features/font-settings/). UI - чекбоксы в модалке профиля; читается в features/message-swipe/wire.js.
import { toggleSetting } from '../core/toggle-setting.js';

// false (по умолчанию) - как в Telegram: справа налево - цитата, слева направо - копировать/скачать.
// true - реверс (например, для RTL): слева направо - цитата, справа налево - копировать/скачать.
const reversed = toggleSetting('xmppChatSwipeReversed', false, 'swipe-reversed-toggle');

// "Двунаправленная цитата": оба свайпа вызывают startReply (message-swipe/wire.js); реверс теряет смысл, wire.js проверяет loadBidiQuote() раньше loadSwipeReversed().
const bidiQuote = toggleSetting('xmppChatSwipeBidiQuote', false, 'swipe-bidi-quote-toggle');

export const loadSwipeReversed = reversed.load;
export const loadBidiQuote = bidiQuote.load;

export const swipeToggles = [reversed, bidiQuote];
