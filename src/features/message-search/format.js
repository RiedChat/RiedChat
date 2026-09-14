// ============ features/message-search/format.js ============
// Форматирование данных для отображения в списке результатов поиска.
import { html, raw } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { nickOf } from '../../core/dom-utils.js';
import { fileNameOf } from './classify.js';
import { t } from '../../i18n/t.js';

const S = state;

export function fmtTime(t){
  return new Date(t).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}

// Вырезает вокруг найденного слова короткий фрагмент текста (как в поиске
// Telegram/WhatsApp) и оборачивает совпадение в <mark> - весь остальной
// текст экранируется отдельно, поэтому HTML-инъекция через текст сообщения
// здесь невозможна, несмотря на то, что <mark> вставляется напрямую.
export function buildSnippet(body, q){
  const raw = String(body || '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  const i = lower.indexOf(q);
  if(i === -1) return String(html`${raw.slice(0, 90)}`);
  const ctx = 34;
  const start = Math.max(0, i - ctx);
  const end = Math.min(raw.length, i + q.length + ctx);
  const before = raw.slice(start, i);
  const match = raw.slice(i, i + q.length);
  const after = raw.slice(i + q.length, end);
  return (start > 0 ? '…' : '') +
    String(html`${before}<mark>${match}</mark>${after}`) +
    (end < raw.length ? '…' : '');
}

export function authorLabel(m){
  if(m && m.out) return t('common.you');
  const c = S.roster[S.activeChat];
  return (c && (c.nick || c.name)) || nickOf(S.activeChat);
}

// Символ иконки-спрайта (#photo/#smile/#camera/...) по категории/типу
// вложения - общий для иконки-заглушки превью и текстовой подписи ниже,
// чтобы оба места (thumbFallbackHtml/mediaLabel) не могли разойтись.
function symbolOf(info){
  if(info.category === 'sticker') return 'smile';
  if(info.category === 'videonote') return 'camera-photo';
  if(info.kind === 'video') return 'camera';
  if(info.kind === 'audio') return 'microphone';
  if(info.kind === 'file') return 'paper-clip';
  return 'photo';
}

// Иконка-заглушка на время (лениво отложенной) расшифровки, либо финальная
// подпись для типов, у которых нет визуального превью (аудио/файл).
// Для стикеров/кружков - своя иконка (см. categoryOf в classify.js), чтобы
// заглушка не выглядела как обычное фото/видео ещё до того, как превью догрузится.
export function thumbFallbackHtml(info){
  const symbol = symbolOf(info);
  return String(html`<span class="search-thumb-fallback"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg"><use href="#${symbol}"></use></svg></span>`);
}

// Текстовая подпись под превью: своя svg-иконка + локализованный текст.
// Раньше метка бралась из message-swipe.js:mediaLabel и приходила с эмодзи
// в начале строки ('📷 Фото' и т.п.) - здесь та же иконка, что и в
// thumbFallbackHtml, но как svg, а не эмодзи-символ в тексте.
export function mediaLabel(info){
  const symbol = symbolOf(info);
  const text = info.kind === 'file' ? fileNameOf(info.url)
    : info.category === 'sticker' ? t('media.kindSticker')
    : info.category === 'videonote' ? t('media.kindVideoNote')
    : info.kind === 'video' ? t('media.kindVideo')
    : info.kind === 'audio' ? t('media.kindAudio')
    : t('media.kindImage');
  return String(html`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg search-result-label-icon"><use href="#${symbol}"></use></svg><span>${text}</span>`);
}
