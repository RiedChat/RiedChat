import { state } from '../../core/state.js';
import { media } from '../../net/media.js';
import { t } from '../../i18n/t.js';

const S = state;

export const KIND_LABEL = {
  image: '📷 ' + t('media.kindImage'),
  video: '🎥 ' + t('media.kindVideo'),
  audio: '🎤 ' + t('media.kindAudio'),
  file: '📎 ' + t('media.kindFile'),
  stickerpack: '🎁 ' + t('media.kindStickerpack'),
};

// Стикеры и кружки (features/stickers/*, features/video-note.js) технически
// уходят как обычное image-/video-вложение (тот же аплоад/шифрование), но в
// предпросмотре списка чатов (ui/roster.js), цитате (ui/chat-view/message-body-html.js)
// и поиске (features/message-search.js) их нужно подписывать иначе, чем
// обычное "Фото"/"Видео" - определяем по маркеру в имени файла (см.
// net/media/mime-kind.js:isSticker/isVideoNote) и подменяем метку здесь же,
// одним местом на все три вызывающих модуля.
export function mediaLabel(kind, url){
  if(kind === 'video' && url && media.isVideoNote(url)) return '⭕ ' + t('media.kindVideoNote');
  if(kind === 'image' && url && media.isSticker(url)) return '🖼️ ' + t('media.kindSticker');
  return KIND_LABEL[kind] || KIND_LABEL.file;
}

export function msgByRow(row){
  // Пока активен режим множественного выбора сообщений (см.
  // features/message-select.js), свайп по строке отключён - иначе жест
  // цитирования/копирования конфликтовал бы с выбором сообщений для удаления.
  if(S.selecting) return null;
  const list = S.messages[S.activeChat] || [];
  const idx = Number(row.dataset.idx);
  return Number.isInteger(idx) ? (list[idx] || null) : null;
}
