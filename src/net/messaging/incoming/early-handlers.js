// =============== net/messaging/incoming/early-handlers.js ===============
// Обработчики служебных станз (не обычное сообщение). Проверяются по очереди, первый совпавший
// обрабатывает станзу и останавливает разбор. Новый тип станзы = новый элемент массива.
import { NS_CHAT_MARKERS, NS_PUBSUB_EVENT, NS_LAST_MESSAGE_CORRECTION, NS_CALL } from '../../../core/constants.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { handleDisplayedMarker } from '../displayed-marker.js';

import { handleCallSignal } from './call-signal.js';
import { handleCorrection } from './correction.js';

// В станзе есть дочерний элемент tag в неймспейсе ns.
const hasChild = (stanza, tag, ns) => stanza.querySelector(tag)?.namespaceURI === ns;

export const earlyHandlers = [
  {
    // Ошибочные станзы игнорируем.
    match: (_stanza, _bare, type) => type === 'error',
    handle(){},
  },
  {
    // Сигнал звонка (offer/answer/candidate/decline/hangup/busy) - свой неймспейс riedchat:call:0.
    // Тип открыт (core/constants.js:NS_CALL), payload (SDP/candidate) - только в <encrypted>.
    // В state.messages/рендер чата не попадает.
    match: (stanza) => hasChild(stanza, 'call-signal', NS_CALL),
    handle: handleCallSignal,
  },
  {
    // XEP-0308: заменяем текст на месте в state.messages, новую запись не добавляем.
    // Только живая доставка.
    match: (stanza) => hasChild(stanza, 'replace', NS_LAST_MESSAGE_CORRECTION),
    handle: handleCorrection,
  },
  {
    // PEP-push об изменении device-list (чужого или нашего с другого устройства) приходит благодаря
    // +notify в entity caps (net/presence/caps.js). Кэш обновляется событием, вместо forceRefresh перед каждой отправкой.
    match: (stanza) => hasChild(stanza, 'event', NS_PUBSUB_EVENT),
    handle: (stanza, bare) => omemo.handlePubsubEvent(bare, stanza.querySelector('event')),
  },
  {
    // XEP-0333: собеседник реально ПОКАЗАЛ сообщение с этим id - красим галочки наших исходящих
    // до него в "прочитано" (двойная галочка).
    match: (stanza) => hasChild(stanza, 'displayed', NS_CHAT_MARKERS),
    handle: (stanza, bare) => handleDisplayedMarker(bare, stanza.querySelector('displayed').getAttribute('id')),
  },
];
