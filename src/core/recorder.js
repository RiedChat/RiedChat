// ===================== core/recorder.js =====================
// Общее для MediaRecorder: выбор mime-типа и создание рекордера со сбором чанков (voice-recorder, video-note, call/media.js).
import { t } from '../i18n/t.js';

import { errMsg, domErrDetail } from './debug-log.js';
import { toast } from './dom-utils.js';

// Есть ли getUserMedia (нет в небезопасном контексте и старых браузерах).
export const hasMediaDevices = () => !!navigator.mediaDevices?.getUserMedia;

// Запрашивает медиапоток: MediaStream либо null (тост с причиной уже показан).
// notSupportedKey - i18n-ключ тоста без getUserMedia, errKey - с {detail}.
export async function getMedia(constraints, notSupportedKey, errKey){
  if(!hasMediaDevices()){ toast(t(notSupportedKey)); return null; }
  try{
    return await navigator.mediaDevices.getUserMedia(constraints);
  }catch(e){
    // e.message у DOMException часто пуст, причина в e.name
    toast(t(errKey, { detail: domErrDetail(e) }));
    return null;
  }
}

// Первый поддерживаемый тип из candidates либо '' (браузер выберет сам).
const pickMimeType = (candidates) =>
  candidates.find(type => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';

// Создаёт MediaRecorder, собирающий непустые чанки в chunks (тот же массив: создать до вызова, не подменять до остановки).
// Бросает, если рекордер создать нельзя - тост показывает вызывающий.
function createMediaRecorder(stream, candidates, chunks){
  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType(candidates) });
  recorder.addEventListener('dataavailable', (e) => { if(e.data?.size > 0) chunks.push(e.data); });
  return recorder;
}

// createMediaRecorder + тост при ошибке. Возвращает рекордер либо null (вызывающий останавливает поток).
// failKey - i18n-ключ тоста с {error}.
export function tryCreateRecorder(stream, candidates, chunks, failKey){
  try{
    return createMediaRecorder(stream, candidates, chunks);
  }catch(e){
    toast(t(failKey, { error: errMsg(e) }));
    return null;
  }
}
