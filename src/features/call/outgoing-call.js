// ===================== features/call/outgoing-call.js =====================
// Исходящий 1:1 звонок: выбор целевых JID и startCall().
import { state } from '../../core/state.js';
import { sendCallSignal } from '../../net/messaging/outgoing/call-signal.js';

import { setCall, endCall, createCall } from './call-state.js';
import { acquireLocalMedia } from './media.js';
import { startPeer } from './peer-connection.js';

// Полные JID контакта для рассылки call-offer: звонок идёт на ВСЕ онлайн-устройства (по bare JID сервер выбрал бы один ресурс).
// Если presence с ресурсами нет (contact.onlineResources пуст), шлём на bare JID.
function targetJidsFor(bareJid){
  const res = state.roster[bareJid] && state.roster[bareJid].onlineResources;
  return res && res.size ? Array.from(res, r => bareJid + '/' + r) : [bareJid];
}

export async function startCall(bareJid, wantVideo){
  if(state.call) return { started:false, reason:'already-in-call' };
  const callId = crypto.randomUUID();
  // localStream может быть null (нет устройств/отказ) - звонок не отменяем, см. acquireLocalMedia().
  const localStream = await acquireLocalMedia(wantVideo);

  const targets = targetJidsFor(bareJid);
  const call = createCall({
    id: callId, bareJid, remoteJid: bareJid, direction:'out', status:'ringing-out',
    localStream,
    // Тип звонка - по наличию видеотрека в localStream, а не по wantVideo: без камеры acquireLocalMedia откатывается на audio-only (или null).
    hasVideo: !!(localStream && localStream.getVideoTracks().length > 0),
    noLocalMedia: !localStream,
    // facingMode ("user") и multipleCameras (асинхронно после enumerateDevices в peer-connection.js:startPeer) - дефолты createCall().
    ringingTargets: new Set(targets),
  });
  setCall(call);

  await startPeer(call, localStream, wantVideo);

  let offer;
  try{
    offer = await call.pc.createOffer();
    await call.pc.setLocalDescription(offer);
  }catch(e){
    console.warn('startCall: createOffer/setLocalDescription failed', e);
    endCall(call);
    return { started:false, reason:'negotiation-error' };
  }

  // Offer шлём на все онлайн-ресурсы параллельно; кто первый принял (signal-handlers.js:_onAnswer), остальным уходит hangup reason:"answered-elsewhere" (_onRemoteEnd).
  const results = await Promise.all(targets.map(t => sendCallSignal(t, 'offer', callId, { sdp: offer.sdp, type: offer.type })));
  const anySent = results.some(r => r.sent);
  if(!anySent){
    endCall(call);
    return { started:false, reason: (results[0] && results[0].reason) || 'send-error' };
  }
  return { started:true, callId };
}
