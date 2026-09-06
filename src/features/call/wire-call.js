// ===================== features/call/wire-call.js =====================
// Кнопка "позвонить" в шапке чата + все кнопки экрана звонка (#call-overlay).
// Сама логика переходов - в call-manager.js, здесь только DOM-события.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { callManager } from './call-manager.js';
import { t } from '../../i18n/t.js';

const S = state;

function failReasonText(reason){
  const map = {
    'no-devices': t('call.fail.noDevices'),
    'all-devices-dead': t('call.fail.allDevicesDead'),
    'omemo-unavailable': t('call.fail.omemoUnavailable'),
    'send-error': t('call.fail.sendError'),
    'already-in-call': t('call.fail.alreadyInCall'),
    'media-error': t('call.fail.mediaError'),
    'insecure-context': t('call.fail.insecureContext'),
    'negotiation-error': t('call.fail.negotiationError'),
    'no-incoming-call': t('call.fail.noIncomingCall'),
  };
  return map[reason];
}

export function wireCall(){
  $('call-start-audio-btn').addEventListener('click', async () => {
    if(!S.activeChat) return;
    const { started, reason } = await callManager.startCall(S.activeChat, false);
    if(!started) toast(failReasonText(reason) || t('call.fail.startFailed'));
  });

  $('call-start-video-btn').addEventListener('click', async () => {
    if(!S.activeChat) return;
    const { started, reason } = await callManager.startCall(S.activeChat, true);
    if(!started) toast(failReasonText(reason) || t('call.fail.startFailed'));
  });

  $('call-accept-btn').addEventListener('click', async () => {
    const { accepted, reason } = await callManager.acceptCall();
    if(!accepted && reason) toast(failReasonText(reason) || t('call.fail.acceptFailed'));
  });

  $('call-decline-btn').addEventListener('click', () => callManager.decline());
  $('call-cancel-btn').addEventListener('click', () => callManager.hangup());
  $('call-hangup-btn').addEventListener('click', () => callManager.hangup());
  $('call-mute-btn').addEventListener('click', () => callManager.toggleMute());
  $('call-camera-btn').addEventListener('click', () => callManager.toggleCamera());
  $('call-switch-cam-btn').addEventListener('click', () => callManager.switchCamera());
  $('call-minimize-btn').addEventListener('click', () => callManager.minimizeCall());
  $('call-return-banner').addEventListener('click', () => callManager.restoreCall());
}
