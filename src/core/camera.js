// ===================== core/camera.js =====================
// Смена видеотрека и определение числа камер (кружки, звонки).
import { t } from '../i18n/t.js';

import { domErrDetail } from './debug-log.js';
import { toast } from './dom-utils.js';

// Есть ли больше одной камеры. Вызывать после getUserMedia: до разрешения enumerateDevices неполон.
// При ошибке возвращает true.
export async function detectMultipleCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput').length > 1;
  }catch{
    return true;
  }
}

const getVideoTrack = async (video) =>
  (await navigator.mediaDevices.getUserMedia({ video, audio: false })).getVideoTracks()[0];

// Заменяет видеотрек. Старый трек останавливается ДО запроса новой камеры (на Android обе не открываются
// одновременно); stop() может бросить - игнорируем.
// constraints - новая камера, fallbackConstraints - откат при ошибке, failKey - i18n-ключ тоста с {detail}.
// Возвращает { track, switched }: switched=false - откат на исходную камеру либо track=null, если не вышло ничего.
export async function swapVideoTrack(oldTrack, constraints, fallbackConstraints, failKey){
  if(oldTrack){ try{ oldTrack.stop(); }catch{} }
  try{
    return { track: await getVideoTrack(constraints), switched: true };
  }catch(e){
    console.warn('swapVideoTrack: getUserMedia failed', e);
    toast(t(failKey, { detail: domErrDetail(e) }));
  }
  try{
    return { track: await getVideoTrack(fallbackConstraints), switched: false };
  }catch{
    return { track: null, switched: false }; // камер нет
  }
}
