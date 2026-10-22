// ===================== ui/call-view.js =====================
// Экран звонка по state.call: только чтение состояния и запись в DOM.
// Логика звонка - в features/call/call-actions.js, signal-handlers.js (вызывает renderCallUI() после мутаций state.call).
import { $, contactName } from '../core/dom-utils.js';
import { setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { t } from '../i18n/t.js';

import { contactAvatarHtml } from './contact-view.js';

// Привязывает поток к <video>, has-stream ставится по наличию видеотрека: в аудиозвонке потоки содержат только аудио, и пустой <video> был бы виден.
function bindStream(el, stream = null){
  if(el.srcObject !== stream) el.srcObject = stream;
  const has = !!stream?.getVideoTracks().length;
  el.classList.toggle('has-stream', has);
  return has;
}

// Ключи подписи статуса: [аудио, видео].
const STATUS_KEYS = {
  'ringing-in': ['call.ringingInAudio', 'call.ringingInVideo'],
  'ringing-out': ['call.ringingOutAudio', 'call.ringingOutVideo'],
  'connecting': ['call.connecting', 'call.connecting'],
  'active': ['call.active', 'call.active'],
};
const statusKey = (status, hasVideo) => STATUS_KEYS[status]?.[hasVideo ? 1 : 0];

// Плашка «вернуться к звонку»: только если открыт чат с собеседником свёрнутого звонка (state.call.minimized).
// Вызывается из app.js:openChat и renderCallUI.
export function renderCallBanner(){
  const banner = $('call-return-banner');
  if(!banner) return;
  const call = state.call;
  const show = !!(call?.minimized && call.bareJid === state.activeChat);
  banner.hidden = !show;
  if(show){
    $('call-return-banner-text').textContent = call.hasVideo ? t('call.returnBannerVideo') : t('call.returnBannerAudio');
  }
}

export function renderCallUI(){
  const call = state.call;
  // При сворачивании скрываем только оверлей: треки и RTCPeerConnection живут дальше.
  const overlay = $('call-overlay');
  overlay.classList.toggle('active', !!call && !call.minimized);
  if(call) renderCallOverlay(call, overlay);
  renderCallBanner();
}

function renderCallOverlay(call, overlay){
  const contact = state.roster[call.bareJid];
  $('call-peer-name').textContent = contactName(call.bareJid);
  setHTML($('call-peer-avatar'), contactAvatarHtml(contact, call.bareJid));
  const key = statusKey(call.status, call.hasVideo);
  $('call-status-label').textContent = key ? t(key) : '';

  // Потоки появятся из pc.ontrack/getUserMedia; WebRTC-слой (peer-connection.js) ещё не подключён.
  const remoteVideo = $('call-remote-video');
  const localVideo = $('call-local-video');
  const remoteHasVideo = bindStream(remoteVideo, call.remoteStream);
  const localHasVideo = bindStream(localVideo, call.localStream);
  // Аудиозвонок (нет видео): чёрный фон на весь экран. Видео перекрывает его само.
  overlay.classList.toggle('audio-only', !call.hasVideo && !remoteHasVideo);
  // Self-view зеркалим только для фронтальной камеры. Исходящий трек зеркалится через canvas (features/call/media.js), не только CSS.
  localVideo.classList.toggle('mirrored', call.facingMode !== 'environment');

  // Видимость и состояние кнопок - тоже CSS по data-атрибутам оверлея (css/call.css).
  // canSwitchCam: видеозвонок, есть исходящий видеотрек и больше одной камеры (multipleCameras ставится асинхронно, см. detectCallMultipleCameras).
  Object.assign(overlay.dataset, {
    status: call.status,
    video: String(!!call.hasVideo),
    muted: String(!!call.muted),
    cameraOff: String(!!call.cameraOff),
    canSwitchCam: String(!!(call.hasVideo && localHasVideo && call.multipleCameras)),
  });
}
