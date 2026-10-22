import { t, tAll } from '../../i18n/t.js';
import { categoryOf } from '../../net/media/mime-kind.js';

// Вид вложения -> [эмодзи, i18n-ключ подписи, id svg-иконки]. Подписи собираются при каждом вызове: метка цитаты уходит в тело на языке отправителя (kindFromLabel).
const KINDS = {
  image: ['📷', 'media.kindImage', 'photo'],
  video: ['🎥', 'media.kindVideo', 'camera'],
  audio: ['🎤', 'media.kindAudio', 'microphone'],
  file: ['📎', 'media.kindFile', 'paper-clip'],
  stickerpack: ['🎁', 'media.kindStickerpack', 'photo'],
  sticker: ['🖼️', 'media.kindSticker', 'smile'],
  videonote: ['⭕', 'media.kindVideoNote', 'camera-photo'],
};

// Виды, для которых цитата хранит в теле метку/ссылку вместо текста.
const QUOTE_KINDS = ['image', 'video', 'audio', 'file', 'stickerpack'];
export const isMediaKind = (kind) => QUOTE_KINDS.includes(kind);

const entryOf = (kind, category = kind) => KINDS[category] || KINDS[kind] || KINDS.file;

// i18n-ключ подписи по kind/category (category приоритетнее: у стикера и кружка своя подпись). Общий для mediaLabel (эмодзи) и features/message-search/format.js (svg).
export const mediaKindKey = (kind, category) => entryOf(kind, category)[1];

// id svg-иконки по kind/category (поиск по чату).
export const mediaKindSymbol = (kind, category) => entryOf(kind, category)[2];

// Стикеры и кружки (features/stickers/*, video-note.js) уходят как обычное image-/video-вложение, но в ростере (ui/roster.js),
// цитате (ui/chat-view/message-body-html.js) и поиске (features/message-search.js) подписываются иначе.
// Определяем по маркеру в имени файла (net/media/mime-kind.js:categoryOf), метка подменяется здесь для всех трёх мест.
export function mediaLabel(kind, url){
  const [emoji, key] = entryOf(categoryOf(kind, url));
  return emoji + ' ' + t(key);
}

// Метка из тела цитаты ('📷 Фото' / '📷 Photo') -> kind или null. Проверяем все локали: метка приходит на языке отправителя.
export function kindFromLabel(text){
  return QUOTE_KINDS.find(kind => tAll(KINDS[kind][1]).some(label => KINDS[kind][0] + ' ' + label === text)) || null;
}
