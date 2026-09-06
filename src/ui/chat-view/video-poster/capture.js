// =============== ui/chat-view/video-poster/capture.js ===============
// Захват текущего декодированного кадра зонда и запись его в videoEl.poster.
import { debugLog } from '../../../core/debug-log.js';
import { onDecodedFrame } from './decoded-frame.js';

export function captureFrame(probe, videoEl, cleanup){
  const grab = () => {
    try{
      const w = probe.videoWidth, h = probe.videoHeight;
      if(w && h){
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(probe, 0, 0, w, h);
        videoEl.poster = canvas.toDataURL('image/jpeg', 0.82);
      } else {
        debugLog('[media] превью видео: videoWidth/Height ещё 0 при захвате кадра');
      }
    }catch(e){
      debugLog('[media] превью видео: не удалось захватить кадр - ' + (e && e.message ? e.message : e));
    }
    cleanup();
  };
  onDecodedFrame(probe, grab);
}
