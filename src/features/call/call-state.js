// ===================== features/call/call-state.js =====================
// Установка/сброс state.call и освобождение ресурсов.
import { state } from '../../core/state.js';
import { renderCallUI } from '../../ui/call-view.js';

import { logCallEvent, callEndSummary } from './call-log.js';
import { stopRingtone } from './ringtone.js';

export function setCall(next){
  state.call = next;
  // Сообщаем Android-обёртке (window.AndroidCallBridge, только в apk), идёт ли звонок: MainActivity.onPause() не должен сбрасывать
  // AudioManager.MODE_IN_COMMUNICATION посреди звонка (диалог разрешений, сворачивание), иначе getUserMedia падает и клиент уходит в receive-only.
  try{ window.AndroidCallBridge?.setCallActive?.(!!next); }
  catch(e){ console.warn('setCall: AndroidCallBridge.setCallActive failed', e); }
  renderCallUI();
}

// JID для сигналов звонка: полный JID ответившего ресурса (remoteJid), пока он не определён - bare JID контакта.
export function peerJid(call){
  return call.remoteJid || call.bareJid;
}

// Единственное место сборки объекта звонка (outgoing-call.js, signal-handlers.js:_onOffer). overrides перекрывают общие поля: направление, статус, hasVideo, offer/ringingTargets.
export function createCall(overrides){
  return {
    id: null, bareJid: null, remoteJid: null, direction: null, status: null,
    pc: null, localStream: null, remoteStream: null, pendingCandidates: [],
    muted: false, cameraOff: false, hasVideo: false, connectedAt: null,
    facingMode: 'user', multipleCameras: false, noLocalMedia: false,
    ...overrides,
  };
}

export function clearIceRestartTimer(call){
  clearTimeout(call._iceRestartTimer);
  call._iceRestartTimer = null;
}

// Останавливает локальные треки и закрывает pc; обязателен перед setCall(null)/заменой звонка, иначе камера/микрофон останутся захвачены.
function teardown(call){
  if(!call) return;
  stopRingtone();
  clearIceRestartTimer(call);
  call._mirror?.stop();
  call._mirror = null;
  if(call.pc){
    for(const h of ['onicecandidate', 'ontrack', 'onconnectionstatechange', 'onnegotiationneeded']) call.pc[h] = null;
    call.pc.close();
  }
  call.localStream?.getTracks().forEach(t => t.stop());
}

// Завершение: запись в историю (необязательно), освобождение ресурсов, сброс state.call. reason - для callEndSummary; без него лог не пишется (звонок не состоялся).
export function endCall(call, reason){
  if(reason) logCallEvent(call, callEndSummary(call, reason));
  teardown(call);
  setCall(null);
}
