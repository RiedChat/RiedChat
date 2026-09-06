// =================== net/messaging/incoming/call-signal.js ===================
// Входящий call-сигнал: тип (offer/answer/candidate/decline/hangup/busy) уже
// виден открытым текстом в <call-signal type="..." id="..."> (см.
// core/constants.js:NS_CALL) - это и есть то, по чему early-handlers.js
// матчит станзу ДО расшифровки. Сам SDP/ICE - только внутри <encrypted>,
// расшифровывается тем же omemo.decryptStanza, что и обычные сообщения.
import { state } from '../../../core/state.js';
import { omemo } from '../../../crypto/omemo/state.js';

// callManager - из чанка features/call/*, который грузится динамически (см.
// app.js:wireEvents). Входящий сигнал может прийти ДО того, как пользователь
// хоть раз нажал что-то, связанное со звонком, поэтому здесь тоже
// динамический import(), а не расчёт на то, что чанк уже подгружен;
// повторные import() одного и того же модуля отдают закешированный промис.
const callManagerPromise = import('../../../features/call/call-manager.js')
  .then(m => m.callManager);

const S = state;

export async function handleCallSignal(stanza, bare){
  const sigEl = stanza.querySelector('call-signal');
  const type = sigEl.getAttribute('type');
  const callId = sigEl.getAttribute('id');
  if(!type || !callId) return;

  // Полный JID отправителя нужен callManager'у для маршрутизации ответных
  // сигналов обратно на КОНКРЕТНЫЙ ресурс собеседника (см.
  // net/messaging/outgoing/call-signal.js и features/call/call-manager.js:
  // targetJidsFor/_onAnswer) - bare JID сервер при отправке роутит только на
  // один ("самый доступный") ресурс, а звонящий теперь шлёт offer сразу на
  // все онлайн-ресурсы контакта.
  const fromJid = stanza.getAttribute('from');
  const fromResource = Strophe.getResourceFromJid(fromJid) || null;

  if(bare === S.myBareJid){
    // Сигнал от нашего же bare JID: сервер никогда не эхо-возвращает
    // станзу её же отправителю, поэтому единственный легитимный случай -
    // это сигнал от ДРУГОГО нашего резолюшена (пользователь звонит себе же,
    // проверяя два устройства); такой обрабатываем как обычный входящий,
    // callManager сам решит через 'busy', занят ли этот конкретный ресурс.
    // Станзу без ресурса или с нашим же текущим ресурсом (испорченная
    // маршрутизация / реальный собственный эхо-сигнал) отбрасываем.
    if(!fromResource || fromResource === S.myResource) return;
  }

  if(!stanza.querySelector('encrypted')) return; // сигнал без OMEMO-конверта - отбрасываем, plaintext-фоллбека для звонков нет

  let payload = null;
  try{
    const plain = await omemo.decryptStanza(stanza);
    if(plain === null) return; // конверт адресован другому нашему устройству
    payload = plain ? JSON.parse(plain) : {};
  }catch(e){
    console.warn('handleCallSignal: не удалось расшифровать/распарсить сигнал', e);
    return;
  }

  const callManager = await callManagerPromise;
  callManager.onSignal(fromJid, bare, type, callId, payload);
}
