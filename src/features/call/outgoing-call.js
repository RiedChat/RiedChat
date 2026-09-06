// ===================== features/call/outgoing-call.js =====================
// Инициация исходящего 1:1 звонка: выбор целевых JID и startCall().
import { state } from '../../core/state.js';
import { uuid } from '../../core/uuid.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';
import { getIceServers } from '../../net/turn/extdisco.js';
import { setCall, teardown } from './call-state.js';
import { acquireLocalMedia, addLocalTracksToCall, addRecvOnlyTransceivers, detectCallMultipleCameras } from './media.js';
import { createPeerConnection } from './peer-connection.js';
import { renderCallUI } from '../../ui/call-view.js';

const S = state;

// Список полных JID (bare/resource) контакта, на которые нужно разослать
// call-offer. Звонок должен прозвониться сразу на ВСЕ его онлайн-устройства
// (телефон + браузер и т.п.) - маршрутизация по одному только bare JID
// сервер отдал бы единственному "самому доступному" ресурсу. Если по
// какой-то причине presence с ресурсами ещё не пришёл (contact.onlineResources
// пуст/не существует), откатываемся на старое поведение - одна отправка на
// bare JID, пусть сервер решает сам.
export function targetJidsFor(bareJid){
  const contact = S.roster[bareJid];
  const resources = contact && contact.onlineResources && contact.onlineResources.size
    ? Array.from(contact.onlineResources)
    : null;
  if(!resources || !resources.length) return [bareJid];
  return resources.map(r => bareJid + '/' + r);
}

export async function startCall(bareJid, wantVideo){
  if(S.call) return { started:false, reason:'already-in-call' };
  const callId = uuid();
  // localStream может быть null (нет камеры/микрофона или отказано в
  // доступе) - это не повод отменять звонок, см. acquireLocalMedia().
  const localStream = await acquireLocalMedia(wantVideo);

  const targets = targetJidsFor(bareJid);
  const call = {
    id: callId, bareJid, remoteJid: bareJid, direction:'out', status:'ringing-out',
    pc:null, localStream, remoteStream:null, pendingCandidates:[], muted:false, cameraOff:false,
    // Реальный тип звонка - по факту наличия видеотрека в localStream, а не
    // по исходному wantVideo: если камера была недоступна, acquireLocalMedia
    // молча откатывается на audio-only (или на null), и звонок фактически
    // голосовой с нашей стороны (собеседник всё ещё может видеть/слышать
    // нас - вернее, только слышать/видеть то, что мы реально можем отдать).
    hasVideo: !!(localStream && localStream.getVideoTracks().length > 0),
    noLocalMedia: !localStream,
    // 'user' - фронтальная камера, дефолт для видеозвонка (см.
    // videoConstraints() в media.js). multipleCameras выставляется чуть ниже
    // асинхронно, после enumerateDevices - до этого кнопка смены камеры в
    // ui/call-view.js просто не показывается.
    facingMode: 'user', multipleCameras: false,
    connectedAt:null, ringingTargets: new Set(targets),
  };
  setCall(call);

  if(call.hasVideo){
    detectCallMultipleCameras().then(has => {
      if(S.call !== call) return; // звонок уже завершён/заменён - поздний результат игнорируем
      call.multipleCameras = has;
      renderCallUI();
    });
  }

  const iceServers = await getIceServers();
  call.pc = createPeerConnection(call, iceServers);
  if(localStream){
    addLocalTracksToCall(call, localStream);
  } else {
    addRecvOnlyTransceivers(call.pc, wantVideo);
  }

  let offer;
  try{
    offer = await call.pc.createOffer();
    await call.pc.setLocalDescription(offer);
  }catch(e){
    console.warn('startCall: createOffer/setLocalDescription failed', e);
    teardown(call);
    setCall(null);
    return { started:false, reason:'negotiation-error' };
  }

  // Шлём offer сразу на все онлайн-ресурсы контакта параллельно - "кто
  // первый принял" (см. signal-handlers.js:_onAnswer), остальным потом
  // уходит hangup с reason:'answered-elsewhere' (см. _onRemoteEnd).
  const results = await Promise.all(targets.map(t => sendCallSignal(t, 'offer', callId, { sdp: offer.sdp, type: offer.type })));
  const anySent = results.some(r => r.sent);
  if(!anySent){
    teardown(call);
    setCall(null);
    return { started:false, reason: (results[0] && results[0].reason) || 'send-error' };
  }
  return { started:true, callId };
}
