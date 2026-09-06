// ===================== features/call/call-state.js =====================
// Установка/сброс текущего звонка (S.call) и освобождение его ресурсов.
import { state } from '../../core/state.js';
import { renderCallUI } from '../../ui/call-view.js';

const S = state;

export function setCall(next){
  S.call = next;
  // Сообщаем нативному Android-обёртчику (CallStateBridge, если он есть -
  // мост присутствует только в apk, в обычном браузере window.AndroidCallBridge
  // не определён), идёт ли сейчас звонок. Нужно, чтобы MainActivity.onPause()
  // не сбрасывал AudioManager.MODE_IN_COMMUNICATION посреди звонка (диалог
  // разрешений, сворачивание и т.п.) - иначе локальный getUserMedia падает
  // и клиент уходит в receive-only, не отдавая свои видео/аудио треки.
  try{
    if(window.AndroidCallBridge && typeof window.AndroidCallBridge.setCallActive === 'function'){
      window.AndroidCallBridge.setCallActive(!!next);
    }
  }catch(e){
    console.warn('setCall: AndroidCallBridge.setCallActive failed', e);
  }
  renderCallUI();
}

// Останавливает локальные треки и закрывает pc - обязателен перед любым
// setCall(null)/заменой звонка, иначе камера/микрофон останутся захвачены
// браузером (индикатор записи в системном UI не погаснет) даже после
// закрытия экрана звонка.
export function teardown(call){
  if(!call) return;
  if(call._iceRestartTimer){ clearTimeout(call._iceRestartTimer); call._iceRestartTimer = null; }
  if(call._mirror){ call._mirror.stop(); call._mirror = null; }
  if(call.pc){
    call.pc.onicecandidate = null;
    call.pc.ontrack = null;
    call.pc.onconnectionstatechange = null;
    call.pc.onnegotiationneeded = null;
    call.pc.close();
  }
  if(call.localStream){
    call.localStream.getTracks().forEach(t => t.stop());
  }
}
