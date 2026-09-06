// ===================== net/media-worker/mime.js =====================
// Определение MIME-типа и категории (image/video/audio/file) файла по
// расширению из URL.
export const MIME_BY_EXT = {
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp',
  mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', ogv:'video/ogg',
  mp3:'audio/mpeg', oga:'audio/ogg', ogg:'audio/ogg', wav:'audio/wav', m4a:'audio/mp4', opus:'audio/ogg',
  weba:'audio/webm'
};

export function extOf(url){
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

export function kindOf(ext){
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
  if(['mp4','webm','mov','ogv'].includes(ext)) return 'video';
  if(['mp3','oga','ogg','wav','m4a','opus','weba'].includes(ext)) return 'audio';
  return 'file';
}
