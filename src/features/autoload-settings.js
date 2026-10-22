// ===================== features/autoload-settings.js =====================
// Автозагрузка входящих вложений, на аккаунт (localStorage). UI - чекбоксы "не загружать автоматически" в features/profile/modal.js.
// При выключенной ui/chat-view/* показывает плашку "нажмите, чтобы загрузить" и качает по тапу.
// Дефолты: image и file выключено (tracking pixel / произвольный файл), остальное включено.
import { state } from '../core/state.js';
import { toggleSetting } from '../core/toggle-setting.js';
import { categoryOf } from '../net/media/mime-kind.js';
import { media } from '../net/media.js';
import { isTrustedContact } from '../net/trusted-contacts.js';

// Чекбокс - "не загружать", поэтому invert; ключ на аккаунт.
const setting = (lsKey, defaultValue, toggleId) =>
  toggleSetting(lsKey, defaultValue, toggleId, { perAccount: true, invert: true });

export const autoload = {
  video: setting('xmppVideoAutoDownload', true, 'video-no-autoload-toggle'),
  videonote: setting('xmppVideoNoteAutoDownload', true, 'videonote-no-autoload-toggle'),
  audio: setting('xmppAudioAutoDownload', true, 'audio-no-autoload-toggle'),
  image: setting('xmppImageAutoDownload', false, 'image-no-autoload-toggle'),
  sticker: setting('xmppStickerAutoDownload', true, 'sticker-no-autoload-toggle'),
  file: setting('xmppFileAutoDownload', false, 'file-no-autoload-toggle'),
};

// Свои картинки показываем сразу; чужие - при включённой автозагрузке И доверенном контакте (net/trusted-contacts.js).
export function canAutoLoadImage(out){
  return out || (autoload.image.load() && isTrustedContact(state.activeChat));
}

// Показывать ли плашку "нажмите, чтобы загрузить" вместо автозагрузки. Единое место для голосовых, media-only пузырей и инлайн-медиа.
// Ключ настройки - категория вложения (categoryOf): videonote/sticker или kind.
export const shouldHoldOff = ({ out, url, kind }) => {
  if(out || media.getCached(url)?.status === 'done') return false;
  const key = categoryOf(kind, url);
  return key !== 'image' && !!autoload[key] && !autoload[key].load();
};
