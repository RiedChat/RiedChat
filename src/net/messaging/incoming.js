// ===================== net/messaging/incoming.js =====================
// Приём входящих станз: сначала служебные (early) обработчики, затем
// водяной знак MAM, затем разбор и применение обычного входящего сообщения.
// Сама логика разнесена по net/messaging/incoming/*.js - этот файл только
// диспетчеризует. Отправка исходящих сообщений - в net/messaging/outgoing.js.
import { earlyHandlers } from './incoming/early-handlers.js';
import { applyWatermark } from './incoming/watermark.js';
import { handleIncomingMessage } from './incoming/message-handler.js';

export async function onMessage(stanza){
  const from = stanza.getAttribute('from');
  const type = stanza.getAttribute('type');
  const bare = Strophe.getBareJidFromJid(from);

  for(const handler of earlyHandlers){
    if(handler.match(stanza, bare, type)){
      await handler.handle(stanza, bare, type);
      return true;
    }
  }

  applyWatermark(stanza);
  return handleIncomingMessage(stanza, bare, type);
}

// onMessage потребляется только из net/connection/bootstrap.js, который
// импортирует его напрямую.
export { handleDisplayedMarker } from './incoming/displayed-marker.js';
