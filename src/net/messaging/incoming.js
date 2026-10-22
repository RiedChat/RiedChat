// ===================== net/messaging/incoming.js =====================
// Приём входящих станз: служебные (early) обработчики -> разбор обычного сообщения.
// Логика обработчиков - в net/messaging/incoming/*.js, здесь диспетчеризация. Исходящие - net/messaging/outgoing.js.
import { earlyHandlers } from './incoming/early-handlers.js';
import { handleIncomingMessage } from './incoming/message-handler.js';

export async function onMessage(stanza){
  const bare = Strophe.getBareJidFromJid(stanza.getAttribute('from'));
  const type = stanza.getAttribute('type');

  for(const handler of earlyHandlers){
    if(handler.match(stanza, bare, type)){
      await handler.handle(stanza, bare, type);
      return true;
    }
  }

  return handleIncomingMessage(stanza, bare, type);
}
