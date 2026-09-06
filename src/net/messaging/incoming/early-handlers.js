// =============== net/messaging/incoming/early-handlers.js ===============
// Обработчики "служебных" станз, которые не являются обычным входящим
// сообщением - каждый проверяется по очереди, первый совпавший обрабатывает
// станзу и останавливает дальнейший разбор. Раньше это была стена из 6
// последовательных if/return внутри одного onMessage - добавление нового
// типа станзы (например, XEP-0308 correction) требовало вписываться в
// середину чужого кода; теперь это просто новый элемент массива.
import { NS_CHAT_MARKERS, NS_PUBSUB_EVENT, NS_LAST_MESSAGE_CORRECTION, NS_CALL } from '../../../core/constants.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { handleCorrection } from './correction.js';
import { handleDisplayedMarker } from './displayed-marker.js';
import { handleCallSignal } from './call-signal.js';

export const earlyHandlers = [
  {
    // Ошибочные станзы полностью игнорируем.
    match: (stanza, bare, type) => type === 'error',
    handle(){},
  },
  {
    // Станзы-результаты MAM-запроса (<message><result xmlns='urn:xmpp:mam:2'>...
    // <forwarded><message><body>...) formally тоже <message> с вложенным <body>,
    // querySelector('body') нашёл бы его на любую глубину - без этой проверки
    // каждое архивное сообщение задваивалось бы как "новое" живое. Разбором
    // MAM-результатов занимается отдельный обработчик внутри net/mam/rsm-query.js.
    match: (stanza) => !!stanza.querySelector('result[xmlns="urn:xmpp:mam:2"]'),
    handle(){},
  },
  {
    // Сигнал звонка (offer/answer/candidate/decline/hangup/busy) - свой
    // неймспейс riedchat:call:0, не XEP. Тип виден открытым текстом (см.
    // core/constants.js:NS_CALL), payload (SDP/candidate) - только внутри
    // <encrypted>. Никогда не должен попасть в S.messages/рендер чата.
    match: (stanza) => {
      const s = stanza.querySelector('call-signal');
      return !!(s && s.namespaceURI === NS_CALL);
    },
    handle: (stanza, bare) => handleCallSignal(stanza, bare),
  },
  {
    // XEP-0308: собеседник (или мы сами - с другого устройства) исправил уже
    // отправленное сообщение - заменяем его текст на месте в S.messages, а не
    // добавляем новую запись в историю. Живая доставка только - исправления,
    // случившиеся, пока чат не был открыт, применяются к архиву задним числом
    // (это уже отдельная история MAM-докачки, здесь не решается).
    match: (stanza) => {
      const r = stanza.querySelector('replace');
      return !!(r && r.namespaceURI === NS_LAST_MESSAGE_CORRECTION);
    },
    handle: (stanza, bare) => handleCorrection(stanza, bare),
  },
  {
    // Push-уведомление PEP об изменении чужого (или нашего собственного, с другого
    // устройства) device-list узла - приходит благодаря +notify в наших entity caps
    // (см. net/presence/caps.js). Это и есть замена безусловному forceRefresh перед
    // каждой отправкой: кэш обновляется здесь, событийно, а не гадаением на пустом месте.
    match: (stanza) => {
      const ev = stanza.querySelector('event');
      return !!(ev && ev.namespaceURI === NS_PUBSUB_EVENT);
    },
    handle: (stanza, bare) => omemo.handlePubsubEvent(bare, stanza.querySelector('event')),
  },
  {
    // XEP-0333: собеседник подтверждает, что реально ПОКАЗАЛ нам сообщение с
    // данным id (а не просто получил его сервером) - красим галочки у наших
    // исходящих сообщений вплоть до этого id в "прочитано" (двойная галочка).
    match: (stanza) => {
      const d = stanza.querySelector('displayed');
      return !!(d && d.namespaceURI === NS_CHAT_MARKERS);
    },
    handle: (stanza, bare) => handleDisplayedMarker(bare, stanza.querySelector('displayed').getAttribute('id')),
  },
];
