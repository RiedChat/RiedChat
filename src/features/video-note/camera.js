// ===================== features/video-note/camera.js =====================
// Управление живым потоком камеры: определение количества камер, стоп всех
// треков/таймеров записи и переключение фронтальная/задняя камера посреди
// записи.
import { $, toast } from '../../core/dom-utils.js';
import { S } from './state.js';
import { t } from '../../i18n/t.js';

// Определяет, есть ли смысл показывать кнопку смены камеры - только если на
// устройстве реально больше одной камеры (enumerateDevices надёжно отдаёт
// подписанные devices только ПОСЛЕ выданного разрешения на камеру, поэтому
// вызывается уже после успешного getUserMedia). Если определить не удалось -
// не скрываем кнопку, пусть пользователь попробует сам и увидит toast с
// ошибкой, если камера реально одна.
export async function detectMultipleCameras(){
  try{
    if(!navigator.mediaDevices.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput').length > 1;
  }catch(e){
    return true;
  }
}

export function stopStream(){
  if(S.rafHandle){ cancelAnimationFrame(S.rafHandle); S.rafHandle = null; }
  // Треки останавливаемого canvas-потока могли быть уже закрыты браузером
  // сам собой (например, если превью-элемент к этому моменту убран из DOM)
  // - двойной stop() на уже остановленном треке безопасен, но иногда бросает.
  if(S.canvasStream){ S.canvasStream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} }); S.canvasStream = null; }
  if(S.stream){ S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
  clearInterval(S.timerHandle); S.timerHandle = null;
  clearTimeout(S.autoStopHandle); S.autoStopHandle = null;
}

// Переключает фронтальную/заднюю камеру ПОСРЕДИ записи, без остановки
// MediaRecorder (см. комментарий в шапке video-note/recording.js про запись
// через canvas). Меняется только видеотрек в `S.stream` (тот, что
// показывается в превью и читается drawFrame) - аудиотрек и сам
// canvasStream, который реально пишет MediaRecorder, не трогаются, поэтому
// переключение не обрывает и не склеивает звук.
export async function switchCamera(){
  if(!S.mediaRecorder || S.mediaRecorder.state !== 'recording') return;
  const newFacing = S.currentFacingMode === 'user' ? 'environment' : 'user';
  // На большинстве Android-устройств фронтальная и задняя камера не могут
  // быть открыты одновременно (одна физическая подсистема камеры на
  // хардварном уровне) - если не остановить старый видеотрек ДО запроса
  // новой камеры, getUserMedia либо падает с NotReadableError, либо (из-за
  // того, что facingMode передан bare-строкой, т.е. как ideal, а не exact)
  // молча возвращает ту же самую камеру без ошибки. Поэтому сначала
  // останавливаем старый трек и только потом запрашиваем новый.
  const oldVideoTrack = S.stream.getVideoTracks()[0];
  // stop() на уже завершившемся треке (камера отключена физически, вкладка
  // потеряла фокус и браузер сам прибрал трек) может бросить - переключение
  // ниже всё равно продолжится запросом новой камеры независимо от исхода.
  if(oldVideoTrack){ try{ oldVideoTrack.stop(); }catch(e){} }
  let newStream;
  try{
    newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: {exact: newFacing}, width: {ideal: 480}, height: {ideal: 480}, aspectRatio: 1 },
      audio: false
    });
  }catch(e){
    const detail = (e && e.name ? e.name : '') + (e && e.message ? ': ' + e.message : (e ? String(e) : ''));
    toast(t('videoNote.cameraSwitchFailed', { detail }));
    // Старый трек уже остановлен - без отката превью останется чёрным.
    // Пытаемся вернуть исходную камеру, чтобы запись не оборвалась молча.
    try{
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: S.currentFacingMode, width: {ideal: 480}, height: {ideal: 480}, aspectRatio: 1 },
        audio: false
      });
      const audioTracks = S.stream.getAudioTracks();
      S.stream = new MediaStream([fallbackStream.getVideoTracks()[0], ...audioTracks]);
      $('video-note-preview').srcObject = S.stream;
    }catch(e2){ /* совсем без камеры оставить нечего - превью просто останется чёрным */ }
    return;
  }
  // Запись уже могла завершиться, пока ждали разрешение/инициализацию новой
  // камеры (пользователь успел нажать "стоп") - тогда просто освобождаем
  // только что полученный поток и ничего не подменяем.
  if(!S.mediaRecorder || S.mediaRecorder.state !== 'recording'){
    // Поток только что получен и никуда не подключён - освобождаем камеру;
    // если трек уже сам завершился к этому моменту, stop() на нём безопасно
    // игнорируем.
    newStream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} });
    return;
  }
  const newVideoTrack = newStream.getVideoTracks()[0];
  const audioTracks = S.stream.getAudioTracks();
  S.stream = new MediaStream([newVideoTrack, ...audioTracks]);
  S.currentFacingMode = newFacing;
  const preview = $('video-note-preview');
  preview.srcObject = S.stream;
  preview.classList.toggle('mirrored', S.currentFacingMode === 'user');
  preview.play().catch(() => {});
  if(navigator.vibrate) navigator.vibrate(8);
}
