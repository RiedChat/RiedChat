// ============ features/message-search/classify.js ============
// Тип тела сообщения: обычный текст или ссылка на вложение целиком (net/media/classify.js:classifyUrl).
import { state } from '../../core/state.js';
import { classifyUrl } from '../../net/media/classify.js';
import { categoryOf } from '../../net/media/mime-kind.js';

// Тело целиком - ссылка на вложение? Как classifyUrl, но, в отличие от classifySingleMedia (ui/chat-view/message-body-html.js),
// опознаёт и файлы (kind "file") - для фильтра "Файлы" и чтобы не показывать голую ссылку.
// category - categoryOf: стикеры и кружки в отдельных категориях.
export function classifyMediaBody(body){
  const single = classifyUrl(body);
  if(!single) return null;
  // Пак стикеров в поиске - обычный файл.
  const kind = single.kind === 'stickerpack' ? 'file' : single.kind;
  return { ...single, kind, category: categoryOf(kind, single.url) };
}

// bareJid отправителя, как в render-messages.js: media.decrypt использует его для TOFU-доверия к upload-хосту.
export function senderJidFor(m){ return m?.out ? state.myBareJid : state.activeChat; }
