// ===================== ui/voice-player/mount.js =====================
// Точка входа: строит плеер голосового/аудио-сообщения, определяя по
// ID3-тегам (crypto/id3-parser.js), какой из двух режимов монтировать -
// waveform-player.js (обычная запись) или track-player.js (музыкальный файл).
import { createLruMap } from '../../core/lru-map.js';
import { html, setHTML } from '../../core/safe-html.js';
import { id3 } from '../../crypto/id3-parser.js';
import { t } from '../../i18n/t.js';

import { mountTrackPlayer } from './track-player.js';
import { mountWaveformPlayer } from './waveform-player.js';

// Кэш fetch+ID3-разбора по blobUrl. blobUrl приходит из net/media.js, где
// уже кэшируется расшифрованный файл per aesgcmUrl - значит для ОДНОГО и
// того же вложения blobUrl не меняется между перерисовками чата
// (render-messages.js:renderMessages пересобирает список на каждое новое
// сообщение и заново монтирует уже показанные ранее плееры). Без этого
// кэша повторный mountVoicePlayer того же файла заново делал fetch(blobUrl)
// + arrayBuffer() + id3.parse() на КАЖДЫЙ такой ремонт, хотя результат
// всегда один и тот же. Ключ - blobUrl (а не aesgcmUrl), т.к. это то, что
// реально приходит сюда и однозначно определяет байты файла.
// Хранит целые arrayBuffer расшифрованных файлов - в отличие от
// _posterCache/_peaksCache самый "тяжёлый" из трёх кэшей на запись, поэтому
// лимит меньше (см. core/lru-map.js про эвикцию без верхней границы).
const _prepared = createLruMap(100); // blobUrl -> Promise<{arrayBuffer, tags}>

function prepareOnce(blobUrl){
  if(_prepared.has(blobUrl)){ _prepared.touch(blobUrl); return _prepared.get(blobUrl); }
  const p = (async () => {
    let arrayBuffer = null;
    try{
      const resp = await fetch(blobUrl);
      arrayBuffer = await resp.arrayBuffer();
    }catch(_e){ /* переживём - просто не будет тегов/волны */ }
    const tags = arrayBuffer ? id3.parse(arrayBuffer) : null;
    return { arrayBuffer, tags };
  })();
  _prepared.set(blobUrl, p);
  return p;
}

// host - контейнер (.media-frame либо .media-embed), blobUrl - расшифрованный файл.
export async function mountVoicePlayer(host, blobUrl){
  setHTML(host, html`<span class="media-loading">⏳ ${t('media.loading')}</span>`);

  const { arrayBuffer, tags } = await prepareOnce(blobUrl);

  if(tags && (tags.title || tags.artist)){
    mountTrackPlayer(host, blobUrl, tags);
  } else {
    mountWaveformPlayer(host, blobUrl, arrayBuffer);
  }
}

