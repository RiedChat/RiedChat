// ===================== features/call/wire-call.js =====================
// Стейт-машина 1:1 звонка (idle -> ringing-out/ringing-in -> connecting -> active -> ended). Модули:
// call-state.js (setCall/teardown), media.js (getUserMedia, recvonly-трансиверы), peer-connection.js (RTCPeerConnection, ICE-restart, pending-кандидаты),
// ringtone.js (гудок/вибрация), call-log.js (события в историю), outgoing-call.js (targetJidsFor/startCall),
// call-actions.js (hangup/decline/acceptCall/toggleMute/toggleCamera/switchCamera/minimizeCall/restoreCall), signal-handlers.js (offer/answer/...).
// Сигналинг: net/messaging/outgoing/call-signal.js (исходящие), net/messaging/incoming/call-signal.js -> signal-handlers.js:onSignal() (входящие).
// ICE_SERVERS: STUN всегда, TURN через XEP-0215 или фоллбек (net/turn/extdisco.js:getIceServers); без TURN звонок за симметричным NAT может не пройти.
//
// Кнопка "позвонить" в шапке чата и кнопки экрана звонка (#call-overlay). Логика переходов - call-actions.js/signal-handlers.js, здесь только DOM-события.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

import { hangup, decline, acceptCall, toggleMute, toggleCamera, switchCamera, minimizeCall, restoreCall } from './call-actions.js';
import { startCall } from './outgoing-call.js';

const FAIL_KEYS = {
  'no-devices': 'call.fail.noDevices',
  'all-devices-dead': 'call.fail.allDevicesDead',
  'omemo-unavailable': 'call.fail.omemoUnavailable',
  'send-error': 'call.fail.sendError',
  'already-in-call': 'call.fail.alreadyInCall',
  'media-error': 'call.fail.mediaError',
  'insecure-context': 'call.fail.insecureContext',
  'negotiation-error': 'call.fail.negotiationError',
  'no-incoming-call': 'call.fail.noIncomingCall',
};
const failReasonText = (reason) => FAIL_KEYS[reason] ? t(FAIL_KEYS[reason]) : undefined;

export function wireCall(){
  for(const [btnId, wantVideo] of [['call-start-audio-btn', false], ['call-start-video-btn', true]]){
    $(btnId).addEventListener('click', async () => {
      if(!state.activeChat) return;
      const { started, reason } = await startCall(state.activeChat, wantVideo);
      if(!started) toast(failReasonText(reason) || t('call.fail.startFailed'));
    });
  }

  $('call-accept-btn').addEventListener('click', async () => {
    const { accepted, reason } = await acceptCall();
    if(!accepted && reason) toast(failReasonText(reason) || t('call.fail.acceptFailed'));
  });

  $('call-decline-btn').addEventListener('click', decline);
  $('call-cancel-btn').addEventListener('click', hangup);
  $('call-hangup-btn').addEventListener('click', hangup);
  $('call-mute-btn').addEventListener('click', toggleMute);
  $('call-camera-btn').addEventListener('click', toggleCamera);
  $('call-switch-cam-btn').addEventListener('click', switchCamera);
  $('call-minimize-btn').addEventListener('click', minimizeCall);
  $('call-return-banner').addEventListener('click', restoreCall);
}
