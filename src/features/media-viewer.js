// ===================== features/media-viewer.js =====================
// Полноэкранный просмотр фото/видео: клик по картинке или кнопке "⛶" на видео открывает модалку
// (закрытие - крестик, фон, Escape). Инлайн-видео в пузыре работает как обычно; модалка - только по кнопке-развороту.
import { $, playQuietly } from '../core/dom-utils.js';

// Маленькое видео в пузыре, из которого открыт полноэкранный плеер; пока модалка открыта - на паузе
// (иначе два <video> с одним blob играют параллельно и рассинхронизируются).
let originVideo = null;

// Ставит на паузу все video, кроме переданного (список сообщений и модалка).
// Нужно при открытии плеера и глобально (подписка на "play" ниже): одновременно играет одно видео/кружок.
function pauseOtherVideos(exceptEl){
  document.querySelectorAll('video').forEach(v => { if(v !== exceptEl) v.pause(); });
}

function openViewer(kind, src, opts){
  if(kind !== 'image' && kind !== 'video') return;
  const content = $('media-viewer-content');
  content.classList.toggle('video-note-viewer', !!opts?.isNote);
  originVideo = null;
  if(kind === 'image'){
    content.replaceChildren(Object.assign(document.createElement('img'), { src, alt: '' }));
  } else {
    const video = Object.assign(document.createElement('video'), { src, controls: true, autoplay: true, playsInline: true });
    // Продолжаем с места, где остановлено маленькое видео; его самого ставим на паузу.
    originVideo = opts?.originVideo || null;
    if(originVideo){
      video.currentTime = originVideo.currentTime;
      originVideo.pause();
    }
    pauseOtherVideos(video);
    content.replaceChildren(video);
  }
  $('media-viewer-modal').classList.add('active');
}

function closeViewer(){
  const modal = $('media-viewer-modal');
  if(!modal.classList.contains('active')) return;
  modal.classList.remove('active');
  const content = $('media-viewer-content');
  const video = content.querySelector('video');
  if(video){
    // Возвращаем позицию в маленькое видео; если полноэкранное играло - продолжаем с того же места.
    if(originVideo){
      originVideo.currentTime = video.currentTime;
      if(!video.paused) playQuietly(originVideo);
    }
    video.pause();
  }
  originVideo = null;
  content.replaceChildren(); // освобождаем blob-URL сразу
}

export function wireMediaViewer(){
  const modal = $('media-viewer-modal');

  $('media-viewer-close').addEventListener('click', closeViewer);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeViewer(); });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.classList.contains('active')) closeViewer();
  });

  // "play" не всплывает - слушаем в capture-фазе на document; при старте ролика ставим на паузу остальные.
  document.addEventListener('play', (e) => {
    if(e.target?.tagName === 'VIDEO') pauseOtherVideos(e.target);
  }, true);

  // Делегирование: медиа подставляются асинхронно (расшифровка) после рендера, поэтому слушаем весь список.
  $('messages').addEventListener('click', (e) => {
    const expandBtn = e.target.closest('.media-expand-btn');
    if(expandBtn){
      e.preventDefault();
      e.stopPropagation();
      const video = expandBtn.parentElement?.querySelector('video');
      // .video-note-box - обёртка кружка (ui/chat-view/media-loader/encrypted-media.js), обычное видео - .video-ratio-box;
      // по классу выбираем круглый фуллскрин (video-note-viewer).
      const isNote = !!expandBtn.parentElement?.classList.contains('video-note-box');
      if(video) openViewer('video', video.currentSrc || video.src, {isNote, originVideo: video});
      return;
    }
    const img = e.target.closest('.bubble img');
    if(img){
      e.preventDefault(); // отменяет переход по <a target="_blank"> вокруг картинки
      openViewer('image', img.currentSrc || img.src);
    }
  });
}
