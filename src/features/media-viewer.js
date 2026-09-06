// ===================== features/media-viewer.js =====================
// Полноэкранный просмотр фото/видео из сообщений: клик по картинке или по
// кнопке "⛶" на видео открывает модальное окно на весь экран с крестиком
// закрытия (плюс клик по фону/Escape). Инлайн-видео в пузыре продолжает
// работать как обычно (свои play/pause/перемотка) - модалка открывается
// только явной кнопкой-разворотом, чтобы не мешать штатным контролам плеера.
import { $ } from '../core/dom-utils.js';

function openViewer(kind, src, opts){
    const content = $('media-viewer-content');
    if(!content) return;
    content.innerHTML = '';
    content.classList.toggle('video-note-viewer', !!(opts && opts.isNote));
    if(kind === 'image'){
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
    if(video){ try{ video.pause(); }catch(e){} }
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
        if(video) openViewer('video', video.currentSrc || video.src, {isNote});
        return;
      }
      const img = e.target.closest('.bubble img');
      if(img){
        e.preventDefault(); // отменяет переход по <a target="_blank">, которая оборачивает картинку
        openViewer('image', img.currentSrc || img.src);
      }
    });
}
