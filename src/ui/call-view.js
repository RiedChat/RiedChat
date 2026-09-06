// ===================== ui/call-view.js =====================
// Отрисовка экрана звонка по S.call - по аналогии с ui/chat-head.js: только
// чтение состояния и запись в DOM, никакой логики звонка/сигналинга здесь
// нет (та - в features/call/call-manager.js, которая вызывает renderCallUI()
// после каждой своей мутации S.call, как send.js вызывает renderMessages()).
import { $, initials, nickOf } from '../core/dom-utils.js';
import { html, setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { t } from '../i18n/t.js';
import { renderCallBanner } from './chat-head.js';

const S = state;

function statusLabels(){
  return {
    'ringing-in': { video: t('call.ringingInVideo'), audio: t('call.ringingInAudio') },
    'ringing-out': { video: t('call.ringingOutVideo'), audio: t('call.ringingOutAudio') },
    'connecting': { video: t('call.connecting'), audio: t('call.connecting') },
    'active': { video: t('call.active'), audio: t('call.active') },
  };
}

export function renderCallUI(){
  const overlay = $('call-overlay');
  const call = S.call;
  if(!call){
    overlay.classList.remove('active');
    renderCallBanner();
    return;
  }
  // Оверлей скрываем при сворачивании (call.minimized), сам звонок при этом
  // не трогаем - треки продолжают играть, RTCPeerConnection не закрывается
  // (см. features/call/call-actions.js:minimizeCall/restoreCall).
  overlay.classList.toggle('active', !call.minimized);
  // Аудиозвонок (нет своего и чужого видео) - чёрный фон на весь экран,
  // как в обычном телефонном звонке, а не светлая тема чата. Как только
  // появляется хоть какое-то видео (своё или собеседника), .call-remote-video
  // сам перекрывает фон - класс здесь не мешает.
  overlay.classList.toggle('audio-only', !call.hasVideo && !(call.remoteStream && call.remoteStream.getVideoTracks().length));

  const contact = S.roster[call.bareJid] || {};
  setHTML($('call-peer-name'), html`${contact.nick || contact.name || nickOf(call.bareJid)}`);
  setHTML($('call-peer-avatar'), contact.avatarUrl
    ? html`<img src="${contact.avatarUrl}" alt="">`
    : html`${initials(call.bareJid)}`);
  const labels = statusLabels()[call.status];
  $('call-status-label').textContent = (labels && (call.hasVideo ? labels.video : labels.audio)) || '';

  $('call-incoming-actions').style.display = (call.direction === 'in' && call.status === 'ringing-in') ? 'flex' : 'none';
  $('call-outgoing-actions').style.display = (call.direction === 'out' && call.status === 'ringing-out') ? 'flex' : 'none';
  $('call-active-actions').style.display = (call.status === 'connecting' || call.status === 'active') ? 'flex' : 'none';

  // Потоков пока не бывает (WebRTC-слой ещё не подключён к call-manager) -
  // код уже готов их принять, как только call.localStream/remoteStream
  // появятся из pc.ontrack/getUserMedia.
  const remoteVideo = $('call-remote-video');
  const localVideo = $('call-local-video');
  if(remoteVideo.srcObject !== (call.remoteStream || null)){
    remoteVideo.srcObject = call.remoteStream || null;
  }
  // has-stream проверяет именно наличие ВИДЕОтрека, а не сам факт объекта
  // MediaStream - в аудиозвонке localStream/remoteStream содержат только
  // аудиотрек, и по одной лишь истинности объекта здесь раньше всё равно
  // показывался пустой чёрный <video> (для local - заметный квадратик с
  // рамкой в углу поверх сплошного чёрного фона аудиозвонка).
  const remoteHasVideo = !!(call.remoteStream && call.remoteStream.getVideoTracks().length);
  const localHasVideo = !!(call.localStream && call.localStream.getVideoTracks().length);
  remoteVideo.classList.toggle('has-stream', remoteHasVideo);
  if(localVideo.srcObject !== (call.localStream || null)){
    localVideo.srcObject = call.localStream || null;
  }
  localVideo.classList.toggle('has-stream', localHasVideo);
  // Зеркалим self-view только для фронтальной камеры - так, как человек
  // привык видеть себя; задняя камера снимает окружающий мир, зеркалить
  // его не нужно. Собеседник при этом видит ту же (зеркальную) картинку -
  // сам исходящий трек зеркалится через canvas в features/call/media.js:
  // addLocalTracksToCall/switchCallCamera, а не только локальный CSS-класс.
  localVideo.classList.toggle('mirrored', call.facingMode !== 'environment');

  $('call-mute-btn').classList.toggle('muted', !!call.muted);
  // Кнопка камеры имеет смысл только на видеозвонке - на аудиозвонке своей
  // камеры нет вовсе, переключать нечего.
  $('call-camera-btn').hidden = !call.hasVideo;
  $('call-camera-btn').classList.toggle('off', !!call.cameraOff);
  // Кнопка смены камеры - только на видеозвонке, пока у нас реально есть
  // исходящий видеотрек, и только если на устройстве больше одной камеры
  // (multipleCameras выставляется асинхронно после старта звонка, см.
  // outgoing-call.js/call-actions.js:detectCallMultipleCameras).
  $('call-switch-cam-btn').hidden = !(call.hasVideo && localHasVideo && call.multipleCameras);
  // Сворачивание доступно на исходящем/соединяющемся/активном звонке - на
  // входящем непринятом сворачивать нечего (сначала нужно принять/отклонить).
  $('call-minimize-btn').hidden = (call.direction === 'in' && call.status === 'ringing-in');

  renderCallBanner();
}
