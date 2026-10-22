// =================== net/messaging/incoming/call-signal.js ===================
// Входящий call-сигнал: тип (offer/answer/candidate/decline/hangup/busy) открыт в
// <call-signal type="..." id="..."> (core/constants.js:NS_CALL) - по нему early-handlers.js матчит
// станзу ДО расшифровки. SDP/ICE - только внутри <encrypted>, расшифровка тем же omemo.decryptStanza.
import { state } from '../../../core/state.js';
import { omemo } from '../../../crypto/omemo/state.js';

// onSignal - из динамически загружаемого чанка features/call/* (app.js:wireEvents). Сигнал может прийти
// до любого действия со звонком, поэтому динамический import() (повторные вызовы отдают кэшированный промис).
const onSignalPromise = import('../../../features/call/signal-handlers.js')
  .then(m => m.onSignal);

export async function handleCallSignal(stanza, bare){
  const sigEl = stanza.querySelector('call-signal');
  const type = sigEl.getAttribute('type');
  const callId = sigEl.getAttribute('id');
  if(!type || !callId) return;

  // Полный JID нужен обработчику сигналов для ответных сигналов на КОНКРЕТНЫЙ ресурс (outgoing/call-signal.js,
  // features/call/outgoing-call.js:targetJidsFor, features/call/signal-handlers.js:_onAnswer): по bare JID сервер роутит на один
  // "самый доступный" ресурс, а offer уходит на все онлайн-ресурсы контакта.
  const fromJid = stanza.getAttribute('from');
  const fromResource = Strophe.getResourceFromJid(fromJid) || null;

  if(bare === state.myBareJid){
    // Сервер не эхо-возвращает станзу отправителю, поэтому сигнал от нашего bare JID - только от ДРУГОГО
    // нашего ресурса (звонок самому себе); обрабатываем как обычный, signal-handlers решит через 'busy'.
    // Без ресурса или с нашим текущим ресурсом (сбой маршрутизации/эхо) - отбрасываем.
    if(!fromResource || fromResource === state.myResource) return;
  }

  if(!stanza.querySelector('encrypted')) return;  // без OMEMO-конверта - отбрасываем (plaintext-фоллбека для звонков нет)

  let payload;
  try{
    const plain = await omemo.decryptStanza(stanza);
    if(plain === null) return;  // конверт для другого нашего устройства
    payload = plain ? JSON.parse(plain) : {};
  }catch(e){
    console.warn('handleCallSignal: не удалось расшифровать/распарсить сигнал', e);
    return;
  }

  const onSignal = await onSignalPromise;
  onSignal(fromJid, bare, type, callId, payload);
}
