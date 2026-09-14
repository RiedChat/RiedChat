// ============= ui/chat-view/media-loader/plain-image.js =============
import { html, setHTML } from '../../../core/safe-html.js';

// Обычная https-картинка (не aesgcm://) с включённой заглушкой "нажмите,
// чтобы загрузить" (см. features/image-settings.js). Расшифровывать нечего -
// по клику просто подменяем плейсхолдер на реальный <img>. В отличие от
// _loadMediaOrDeferForVideo, тут нет ни media.decrypt(), ни постоянного кэша:
// картинка и так лежит открытым текстом на исходном хосте, повторная
// загрузка каждый раз - ожидаемое поведение (иначе пришлось бы держать
// собственный кэш только ради экономии одного повторного GET).
export function loadPlainImage(placeholderId, url){
  const host = document.getElementById(placeholderId);
  if(!host) return;
  let started = false;
  const startLoad = () => {
    if(started) return;
    started = true;
    host.classList.remove('image-tap-load', 'video-tap-load');
    setHTML(host, html`<a href="${url}" target="_blank" rel="noopener"><img src="${url}"></a>`);
  };
  host.addEventListener('click', startLoad, {once: true});
}
