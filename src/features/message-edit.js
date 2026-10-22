// ===================== features/message-edit.js =====================
// Редактирование своего отправленного текстового сообщения:
// - тач: тап двумя пальцами по пузырю (message-edit/two-finger.js);
// - ПК: средняя кнопка мыши либо два клика подряд (message-edit/click-triggers.js).
// Открывает плашку над полем ввода, как цитата (ui/chat-head.js:renderReplyBar), с заголовком "Редактирование"; текст подставляется в поле.
// Отправка - net/messaging/outgoing.js:editMessage (XEP-0308) из sendCurrentMessage при state.editing != null.
// Закрывается кликом по плашке, как цитата (features/message-swipe/wire.js).
import { $ } from '../core/dom-utils.js';

import { wireClickTriggers } from './message-edit/click-triggers.js';
import { wireTwoFingerEdit } from './message-edit/two-finger.js';

export { cancelEdit } from './message-edit/core.js';

export function wireMessageEdit(){
  const el = $('messages');

  wireTwoFingerEdit(el);
  wireClickTriggers(el);
}
