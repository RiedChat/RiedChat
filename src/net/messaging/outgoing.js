// ===================== net/messaging/outgoing.js =====================
// Формирование и отправка исходящих сообщений (в т.ч. OMEMO-шифрование) и
// отправка XEP-0333 displayed-маркеров. Приём/разбор входящих станз -
// в net/messaging/incoming.js.
// Реализация разнесена по модулям в outgoing/:
//   outgoing/encrypt-or-fallback.js - общая логика OMEMO-шифрования+fallback
//   outgoing/stanza-body.js         - сборка тела станзы
//   outgoing/displayed-marker.js    - sendDisplayedMarker
//   outgoing/send.js                - sendMessage
//   outgoing/edit.js                - editMessage (XEP-0308)
//   outgoing/compose.js             - sendCurrentMessage, buildQuotedBody (UI-слой)
//   outgoing/fallback-notify.js     - notifyEncryptionFallback
// Этот файл - просто barrel, сохраняющий прежний публичный API/путь импорта.
export { sendDisplayedMarker } from './outgoing/displayed-marker.js';
export { sendMessage } from './outgoing/send.js';
export { editMessage } from './outgoing/edit.js';
export { sendCurrentMessage, buildQuotedBody } from './outgoing/compose.js';
export { notifyEncryptionFallback } from './outgoing/fallback-notify.js';
