// ===================== features/voice-recorder/recorder.js =====================
// Жизненный цикл записи голосового через MediaRecorder: запрос микрофона,
// старт/остановка потока, сборка Blob по завершении и отправка тем же
// путём, что и обычные файлы (uploadAndSend), поэтому шифруется по
// XEP-0454 точно так же, как фото/видео, если для чата включён OMEMO.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { uploadAndSend } from '../../net/upload.js';
import { pickMimeType, fmtTime } from './format.js';
import { t } from '../../i18n/t.js';
const S = state;

export function createVoiceRecorder(){
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let timerHandle = null;
  let startedAt = 0;
  let cancelled = false;

  function showRecordingUI(v){
    $('composer-text').style.display = v ? 'none' : 'flex';
    $('composer-recording').style.display = v ? 'flex' : 'none';
  }

  function stopStream(){
    if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    clearInterval(timerHandle);
    timerHandle = null;
  }

  async function startRecording(){
    if(!S.activeChat){ toast(t('voiceRecorder.selectContactFirst')); return; }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      toast(t('voiceRecorder.notSupported')); return;
    }
    try{
      stream = await navigator.mediaDevices.getUserMedia({audio: true});
    }catch(e){
      // e.message у DOMException часто пустой - реальная причина в e.name
      // (NotAllowedError / NotFoundError / NotReadableError / SecurityError и т.п.)
      const detail = (e && e.name ? e.name : '') + (e && e.message ? ': ' + e.message : (e ? String(e) : ''));
      toast(t('voiceRecorder.noMicAccess', { detail }));
      return;
    }
    cancelled = false;
    chunks = [];
    const mimeType = pickMimeType();
    try{
      mediaRecorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
    }catch(e){
      toast(t('voiceRecorder.startFailed', { error: e && e.message ? e.message : e }));
      stopStream();
      return;
    }
    mediaRecorder.addEventListener('dataavailable', (e) => { if(e.data && e.data.size > 0) chunks.push(e.data); });
    mediaRecorder.addEventListener('stop', onRecorderStop);
    mediaRecorder.start();
    startedAt = Date.now();
    $('recording-time').textContent = '0:00';
    showRecordingUI(true);
    timerHandle = setInterval(() => {
      $('recording-time').textContent = fmtTime(Date.now() - startedAt);
    }, 250);
  }

  function onRecorderStop(){
    showRecordingUI(false);
    const usedMimeType = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
    stopStream();
    if(cancelled || chunks.length === 0){ chunks = []; return; }
    const blob = new Blob(chunks, {type: usedMimeType});
    chunks = [];
    // .weba - своё расширение для голосовых, чтобы плеер в чате показывал <audio>,
    // а не <video> (media.js отличает webm-видео от webm-аудио именно по расширению).
    const ext = usedMimeType.includes('ogg') ? 'oga' : 'weba';
    const file = new File([blob], 'voice-' + Date.now() + '.' + ext, {type: usedMimeType});
    if(!S.activeChat){ toast(t('voiceRecorder.chatClosedNotSent')); return; }
    uploadAndSend(file);
  }

  function stopAndSend(){
    if(mediaRecorder && mediaRecorder.state !== 'inactive'){ cancelled = false; mediaRecorder.stop(); }
  }
  function stopAndCancel(){
    if(mediaRecorder && mediaRecorder.state !== 'inactive'){ cancelled = true; mediaRecorder.stop(); }
  }

  return { startRecording, stopAndSend, stopAndCancel };
}
