// ===================== features/message-edit.js =====================
// Редактирование уже отправленного своего текстового сообщения:
//  - на тачскрине - тап ДВУМЯ пальцами одновременно по пузырю (в любом месте
//    внутри него, включая сам текст сообщения) - см. message-edit/two-finger.js;
//  - на ПК - клик колёсиком мыши (средняя кнопка) по сообщению, зажатые
//    одновременно левая+правая кнопки мыши над сообщением, либо два обычных
//    клика подряд - см. message-edit/mouse-buttons.js и
//    message-edit/click-triggers.js.
// Открывает ту же плашку над полем ввода, что и цитирование (см.
// ui/chat-head.js:renderReplyBar), только с заголовком "Редактирование" -
// текст сообщения при этом подставляется в поле ввода для правки. Отправка
// исправления - net/messaging/outgoing.js:editMessage (XEP-0308), запускается
// из sendCurrentMessage, когда S.editing не null. Закрывается так же, как и
// цитата - кликом по самой плашке (см. features/message-swipe.js).
import { $ } from '../core/dom-utils.js';
import { wireTwoFingerEdit } from './message-edit/two-finger.js';
import { wireBothButtonsEdit } from './message-edit/mouse-buttons.js';
import { wireClickTriggers } from './message-edit/click-triggers.js';

export { startEdit, cancelEdit } from './message-edit/core.js';

export function wireMessageEdit(){
  const el = $('messages');
  if(!el) return;

  wireTwoFingerEdit(el);
  wireBothButtonsEdit(el);
  wireClickTriggers(el);
}
