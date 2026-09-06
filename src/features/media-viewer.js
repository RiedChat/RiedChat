// ===================== features/media-viewer.js =====================
// Полноэкранный просмотр фото/видео из сообщений: клик по картинке или по
// кнопке "⛶" на видео открывает модальное окно на весь экран с крестиком
// закрытия (плюс клик по фону/Escape). Инлайн-видео в пузыре продолжает
// работать как обычно (свои play/pause/перемотка) - модалка открывается
// только явной кнопкой-разворотом, чтобы не мешать штатным контролам плеера.
import { $ } from '../core/dom-utils.js';

// Маленькое видео в пузыре, из которого открыт полноэкранный плеер. Пока
// модалка открыта, оно на паузе - раньше оно продолжало играть на фоне
// одновременно с полноэкранным (тот же blob, но два независимых <video>),
// из-за чего звук/позиция расходились, и после закрытия модалки казалось,
// что кружок "рассинхронизировался".
let originVideo = null;

// Останавливает все video-элементы в документе, кроме переданного - и в
// списке сообщений, и в самой модалке. Используется и при открытии
// полноэкранного плеера, и глобально (см. подписку на 'play' ниже) - чтобы
// одновременно всегда играло только одно видео/кружок, как для экономии
// ресурсов, так и чтобы не накладывался звук нескольких роликов сразу.
function pauseOtherVideos(exceptEl){
  document.querySelectorAll('video').forEach(v => {
    if(v !== exceptEl && !v.paused){
      try{ v.pause(); }catch(e){}
    }
  });
}

function openViewer(kind, src, opts){
    const content = $('media-viewer-content');
    if(!content) return;
    content.innerHTML = '';
    content.classList.toggle('video-note-viewer', !!(opts && opts.isNote));
    if(kind === 'image'){
      originVideo = null;
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      content.appendChild(img);
    } else if(kind === 'video'){
      const video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      // Продолжаем ровно с того места, где было остановлено маленькое видео
      // в пузыре (а не с начала) и ставим само маленькое видео на паузу -
      // иначе оба экземпляра играют параллельно и расходятся по времени.
      originVideo = (opts && opts.originVideo) || null;
      if(originVideo){
        try{ video.currentTime = originVideo.currentTime; }catch(e){}
        try{ originVideo.pause(); }catch(e){}
      }
      pauseOtherVideos(video);
      content.appendChild(video);
    } else {
      return;
    }
    $('media-viewer-modal').classList.add('active');
  }

  export function closeViewer(){
    const modal = $('media-viewer-modal');
    if(!modal || !modal.classList.contains('active')) return;
    modal.classList.remove('active');
    const content = $('media-viewer-content');
    const video = content && content.querySelector('video');
    // Модалка и так закрывается, элемент ниже уничтожается через innerHTML=''
    // - сорвавшийся pause() (например, источник уже отвалился) ни на что не влияет.
    if(video){
      // Возвращаем позицию в маленькое видео и, если полноэкранное играло,
      // продолжаем воспроизведение с того же места - без этого маленькое
      // видео при закрытии оставалось там, где было в момент открытия
      // модалки, и выглядело "отставшим" (тот самый рассинхрон).
      if(originVideo){
        try{
          originVideo.currentTime = video.currentTime;
          if(!video.paused) originVideo.play().catch(() => {});
        }catch(e){}
      }
      try{ video.pause(); }catch(e){}
    }
    originVideo = null;
    if(content) content.innerHTML = ''; // отпускаем blob-URL из DOM сразу, а не ждём следующего открытия
}

// Экспортируется под тем же именем, что было в App.ui.openMediaViewer -
// ни один из ещё не мигрированных файлов на него не ссылается (проверено
// grep'ом по window.App.ui.openMediaViewer), поэтому window.App-мост не нужен.
export { openViewer as openMediaViewer };

export function wireMediaViewer(){
    const modal = $('media-viewer-modal');
    if(!modal) return;

    $('media-viewer-close').addEventListener('click', closeViewer);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeViewer(); });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('active')) closeViewer();
    });

    // 'play' не всплывает - слушаем на фазе погружения (capture) на document,
    // чтобы поймать запуск любого видео/кружка в списке сообщений или в
    // самой модалке. При старте одного ролика ставим на паузу все прочие -
    // без этого можно было включить сразу несколько кружков/видео, и они
    // играли одновременно, наслаивая звук и тратя ресурсы на декодирование.
    document.addEventListener('play', (e) => {
      if(e.target && e.target.tagName === 'VIDEO') pauseOtherVideos(e.target);
    }, true);

    // Делегирование: слушаем клики на всём списке сообщений, а не вешаем
    // обработчик на каждую картинку отдельно - картинки/видео подставляются
    // асинхронно (расшифровка) уже после первого рендера.
    const messagesEl = $('messages');
    if(!messagesEl) return;
    messagesEl.addEventListener('click', (e) => {
      const expandBtn = e.target.closest('.media-expand-btn');
      if(expandBtn){
        e.preventDefault();
        e.stopPropagation();
        const video = expandBtn.parentElement && expandBtn.parentElement.querySelector('video');
        // .video-note-box - обёртка круглого кружка (см. media-loader.js);
        // обычное видео лежит в .video-ratio-box. По этому классу решаем,
        // рисовать ли фуллскрин-просмотр круглым (video-note-viewer, ниже).
        const isNote = !!(expandBtn.parentElement && expandBtn.parentElement.classList.contains('video-note-box'));
        if(video) openViewer('video', video.currentSrc || video.src, {isNote, originVideo: video});
        return;
      }
      const img = e.target.closest('.bubble img');
      if(img){
        e.preventDefault(); // отменяет переход по <a target="_blank">, которая оборачивает картинку
        openViewer('image', img.currentSrc || img.src);
      }
    });
}
