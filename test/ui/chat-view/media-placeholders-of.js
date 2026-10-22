// Плейсхолдеры догрузки из разметки: [{type, url, holdOff}] по data-media-* (src/ui/chat-view/media-placeholder.js:mediaAttrs).
export function placeholdersOf(htmlStr){
  const root = document.createElement('div');
  root.innerHTML = String(htmlStr);
  return Array.from(root.querySelectorAll('[data-media-type]')).map(el => ({
    type: el.dataset.mediaType,
    url: el.dataset.mediaUrl,
    holdOff: el.dataset.hold === 'true',
  }));
}
