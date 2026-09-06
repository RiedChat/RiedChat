// ============ features/message-search/classify.js ============
// Классификация тела сообщения: обычный текст или ссылка на вложение
// целиком (см. также ui/chat-view/message-body-html.js:classifySingleMedia,
// откуда взят тот же принцип, но здесь дополнительно не отбрасываются файлы).
import { state } from '../../core/state.js';
import { media } from '../../net/media.js';
import { URL_RE, IMG_RE } from '../../core/text-patterns.js';
import { t } from '../../i18n/t.js';

const S = state;

// Стикеры и кружки - технически обычное image-/video-вложение (см.
// net/media/mime-kind.js:isSticker/isVideoNote), но для фильтра поиска
// выделяем их в собственные категории, отдельные от "Фото"/"Видео" -
// иначе стикеры засоряли бы галерею обычных фотографий и наоборот.
export function categoryOf(kind, url){
  if(kind === 'image' && media.isSticker(url)) return 'sticker';
  if(kind === 'video' && media.isVideoNote(url)) return 'videonote';
  return kind;
}

// Определяет, является ли тело сообщения ЦЕЛИКОМ ссылкой на вложение -
// та же логика, что и classifySingleMedia в ui/chat-view/message-body-html.js,
// но, в отличие от неё, не отбрасывает файлы (kind 'file') - здесь их тоже
// нужно опознавать: для фильтра "Файлы" и чтобы не показывать в списке
// результатов голую ссылку.
export function classifyMediaBody(body){
  const trimmed = String(body || '').trim();
  if(!trimmed) return null;
  const aesMatches = trimmed.match(media.AESGCM_RE);
  if(aesMatches && aesMatches.length === 1 && aesMatches[0] === trimmed){
    const kind = media.kindOf(media.extOf(trimmed)) || 'file';
    return { encrypted: true, kind, category: categoryOf(kind, trimmed), url: trimmed };
  }
  const urlMatches = trimmed.match(URL_RE);
  if(urlMatches && urlMatches.length === 1 && urlMatches[0] === trimmed){
    const kind = IMG_RE.test(trimmed) ? 'image' : 'file';
    return { encrypted: false, kind, category: categoryOf(kind, trimmed), url: trimmed };
  }
  return null;
}

export function fileNameOf(url){
  try{ return decodeURIComponent((url.split('#')[0].split('/').pop() || '').split('?')[0]) || t('common.fileFallbackWord'); }
  catch(e){ return t('common.fileFallbackWord'); }
}

// Тот же выбор bareJid отправителя, что и в render-messages.js - media.decrypt
// использует его как TOFU-доверие к upload-хосту собеседника.
export function senderJidFor(m){ return (m && m.out) ? S.myBareJid : S.activeChat; }
