// ===================== ui/chat-view/media-traits.js =====================
// Признаки вложения по ссылке: вид (image/video/audio/file), кружок (videonote-*), стикер (sticker-*).
import { shouldHoldOff } from '../../features/autoload-settings.js';
import { kindOf, extOf, isVideoNote, isSticker } from '../../net/media/mime-kind.js';
import { extractThumbDataUrl } from '../../net/media/thumb-codec.js';

// kind можно передать, если он уже известен (kindOf/extOf тогда не вызываются).
export function mediaTraits(url, kind = kindOf(extOf(url))){
  return { kind, isNote: kind === 'video' && isVideoNote(url), isSticker: kind === 'image' && isSticker(url) };
}

// Превью из ссылки (thumb-codec.js): только у видео/кружков, иначе null.
export const embeddedThumb = (kind, url) => kind === 'video' ? extractThumbDataUrl(url) : null;

// Всё для плейсхолдера: признаки, встроенное превью и решение «ждать тапа» (shouldHoldOff). Свои исходящие (out) не задерживаются.
export function describeMedia(url, { out, kind } = {}){
  const traits = mediaTraits(url, kind);
  return {
    ...traits,
    thumbDataUrl: embeddedThumb(traits.kind, url),
    holdOff: shouldHoldOff({ out, url, kind: traits.kind }),
  };
}
