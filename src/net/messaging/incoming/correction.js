// ================ net/messaging/incoming/correction.js ================
// XEP-0308: применение входящего исправления отправленного сообщения.
import { state } from '../../../core/state.js';
import { patchMessageBody } from '../../../ui/chat-view/render-messages.js';
import { history } from '../../history.js';
import { parseIncomingBody } from '../../message-body-parser.js';

// Находит сообщение с id === id из <replace> и заменяет body. Разбор тела - parseIncomingBody
// (как для обычных сообщений; исправление может быть OMEMO-зашифровано).
export async function handleCorrection(stanza, bare){
  const replaceEl = stanza.querySelector('replace');
  const targetId = replaceEl?.getAttribute('id');
  if(!targetId) return;
  // Как в message-handler.js: незашифрованное эхо собственной правки игнорируем - она уже применена
  // локально при отправке (outgoing.js:editMessage).
  if(bare === state.myBareJid && !stanza.querySelector('encrypted')) return;

  const parsed = await parseIncomingBody(stanza, bare);
  if(!parsed) return;  // для другого нашего устройства, пусто или собственное зашифрованное эхо

  const list = state.messages[bare];
  if(!list) return;
  // XEP-0308: исправлять можно только своё сообщение. Правка из чата с контактом (bare !== myBareJid)
  // применяется лишь к его сообщению (out:false) - иначе собеседник подменил бы в нашей истории
  // НАШЕ исходящее (out:true) через <replace id="...">. Симметрично, эхо собственной правки
  // (bare === myBareJid) - только к out:true (то же на исходящем пути: outgoing/edit.js).
  const expectedOut = bare === state.myBareJid;
  const targetIdx = list.findIndex(m => m && m.id === targetId && !!m.out === expectedOut);
  if(targetIdx === -1) return;  // сообщения нет в локальной истории или оно чужое - игнорируем
  const target = list[targetIdx];
  target.body = parsed.body;
  target.encrypted = parsed.encrypted;
  target.edited = true;
  history.saveThread(bare, list);
  // Перерисовываем только этот пузырь (см. displayed-marker.js:handleDisplayedMarker).
  if(state.activeChat === bare) patchMessageBody(targetIdx);
}
