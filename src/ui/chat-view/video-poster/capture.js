// =============== ui/chat-view/video-poster/capture.js ===============
// Захват текущего декодированного кадра зонда и запись его в videoEl.poster.
import { debugLog } from '../../../core/debug-log.js';
import { onDecodedFrame } from './decoded-frame.js';

// Постер в вёрстке показывается миниатюрой ~300-400px по ширине (см.
// media-messages.css) - кодировать кадр в JPEG в РЕАЛЬНОМ разрешении ролика
// (нередко 1920x1080 и выше) было лишней нагрузкой на toDataURL() и раздувало
// dataURL-строки, которые потом навсегда оседают в _posterCache
// (video-poster/index.js) на всю сессию вкладки. Даунскейлим канвас до этой
// ширины перед кодированием - превью визуально не отличить, а строка и
// работа CPU меньше на порядок для 4K/1080p-видео.
const MAX_POSTER_WIDTH = 400;

export function captureFrame(probe, videoEl, cleanup){
  const grab = () => {
    try{
      const w = probe.videoWidth, h = probe.videoHeight;
      if(w && h){
        const scale = Math.min(1, MAX_POSTER_WIDTH / w);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext('2d').drawImage(probe, 0, 0, cw, ch);
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
