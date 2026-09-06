// ===================== features/call/call-manager.js =====================
// Стейт-машина 1:1 звонка (idle → ringing-out/ringing-in → connecting →
// active → ended). Сама реализация разнесена по соседним модулям:
//   call-state.js       - setCall/teardown (S.call, освобождение ресурсов)
//   media.js             - getUserMedia / recvonly-трансиверы
//   peer-connection.js   - RTCPeerConnection, ICE-restart, pending-кандидаты
//   ringtone.js          - гудок/вибрация на входящий звонок
//   call-log.js          - запись событий звонка в историю чата
//   outgoing-call.js      - targetJidsFor/startCall (инициация исходящего)
//   call-actions.js       - hangup/decline/acceptCall/toggleMute/toggleCamera/switchCamera/minimizeCall/restoreCall
//   signal-handlers.js   - обработка входящих сигналов (offer/answer/...)
// Сигналинг - net/messaging/outgoing/call-signal.js (исходящие) и
// net/messaging/incoming/call-signal.js → onSignal() (входящие).
//
// ICE_SERVERS: STUN всегда, TURN - через XEP-0215 либо фоллбек-эндпоинт
// (см. net/turn/extdisco.js:getIceServers). Без TURN звонок между двумя
// устройствами за симметричным NAT (мобильная сеть, часть корпоративных
// Wi-Fi) может не пройти - только STUN достаточен не всегда.
//
// Этот файл - только тонкий барьер: собирает публичный объект callManager
// из соседних модулей, сам не содержит логики.
import { startCall } from './outgoing-call.js';
import { hangup, decline, acceptCall, toggleMute, toggleCamera, switchCamera, minimizeCall, restoreCall } from './call-actions.js';
import { onSignal } from './signal-handlers.js';

export const callManager = {
  // ---------- исходящий звонок ----------
  startCall,
  hangup,
  decline,
  acceptCall,
  toggleMute,
  toggleCamera,
  switchCamera,
  minimizeCall,
  restoreCall,
  // ---------- входящие сигналы (см. net/messaging/incoming/call-signal.js) ----------
  onSignal,
};
