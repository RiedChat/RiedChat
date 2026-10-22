// ===================== features/voice-recorder/recorder.js =====================
// Запись голосового через MediaRecorder: микрофон, старт/стоп, сборка Blob, отправка через uploadAndSend
// (шифруется по XEP-0454 как фото/видео при включённом OMEMO). Жест на кнопке микрофона - gesture.js.
// Наружу - wireVoiceRecorder (вызывается из app.js).
import { $, toast, formatMmSs } from '../../core/dom-utils.js';
import { getMedia, tryCreateRecorder } from '../../core/recorder.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { uploadAndSend } from '../../net/upload.js';

import { wireMicGesture } from './gesture.js';

const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

function createVoiceRecorder(){
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let timerHandle = null;
  let startedAt = 0;
  let cancelled = false;

  function showRecordingUI(v){
    $('composer-text').hidden = v;
    $('composer-recording').hidden = !v;
  }

  function stopStream(){
    if(stream){ stream.getTracks().forEach(track => track.stop()); stream = null; }
    clearInterval(timerHandle);
    timerHandle = null;
  }

  async function startRecording(){
    if(!state.activeChat){ toast(t('voiceRecorder.selectContactFirst')); return; }
    stream = await getMedia({ audio: true }, 'voiceRecorder.notSupported', 'voiceRecorder.noMicAccess');
    if(!stream) return;
    cancelled = false;
    chunks = [];
    mediaRecorder = tryCreateRecorder(stream, AUDIO_MIME_CANDIDATES, chunks, 'voiceRecorder.startFailed');
    if(!mediaRecorder){ stopStream(); return; }
    mediaRecorder.addEventListener('stop', onRecorderStop);
    mediaRecorder.start();
    startedAt = Date.now();
    $('recording-time').textContent = '0:00';
    showRecordingUI(true);
    timerHandle = setInterval(() => {
      $('recording-time').textContent = formatMmSs((Date.now() - startedAt) / 1000);
    }, 250);
  }

  function onRecorderStop(){
    showRecordingUI(false);
    const usedMimeType = mediaRecorder?.mimeType || 'audio/webm';
    stopStream();
    if(cancelled || chunks.length === 0){ chunks = []; return; }
    const blob = new Blob(chunks, {type: usedMimeType});
    chunks = [];
    // .weba - чтобы чат показывал <audio>, а не <video> (media.js отличает webm-аудио от видео по расширению).
    const ext = usedMimeType.includes('ogg') ? 'oga' : 'weba';
    const file = new File([blob], 'voice-' + Date.now() + '.' + ext, {type: usedMimeType});
    if(!state.activeChat){ toast(t('voiceRecorder.chatClosedNotSent')); return; }
    uploadAndSend(file);
  }

  function stop(isCancel){
    if(mediaRecorder && mediaRecorder.state !== 'inactive'){ cancelled = isCancel; mediaRecorder.stop(); }
  }
  const stopAndSend = () => stop(false);
  const stopAndCancel = () => stop(true);

  return { startRecording, stopAndSend, stopAndCancel };
}

export function wireVoiceRecorder(){
  const recorder = createVoiceRecorder();
  wireMicGesture(recorder);

  $('stop-record-btn').addEventListener('click', recorder.stopAndSend);
  $('cancel-record-btn').addEventListener('click', recorder.stopAndCancel);
}
