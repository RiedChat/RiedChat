// ===================== ui/voice-player/mount.js =====================
// Точка входа: строит плеер голосового/аудио, по ID3-тегам (id3-parser.js) выбирая режим: waveform-player.js (запись) или track-player.js (музыка).
import { createLruMemo } from '../../core/lru-map.js';
import { setHTML } from '../../core/safe-html.js';
import { loadingHtml } from '../chat-view/media-placeholder.js';

import { parseId3 } from './id3-parser.js';
import { mountTrackPlayer } from './track-player.js';
import { mountWaveformPlayer } from './waveform-player.js';

// Кэш fetch+ID3-разбора по blobUrl. blobUrl стабилен для вложения между перерисовками (net/media.js кэширует расшифрованный файл по aesgcmUrl), а render-messages.js монтирует плеер заново при возврате строки в окно или пересоздании diff-ом. Без кэша каждый такой ремонт делал fetch(blobUrl) + arrayBuffer() + parseId3().
// Хранит целые arrayBuffer - самый тяжёлый из трёх кэшей (_posterCache/_peaksCache), поэтому лимит меньше (core/lru-map.js).
const _prepared = createLruMemo(100); // blobUrl -> Promise<{arrayBuffer, tags}>

async function prepare(blobUrl){
  let arrayBuffer = null;
  try{
    const resp = await fetch(blobUrl);
    arrayBuffer = await resp.arrayBuffer();
  }catch{ /* переживём: просто не будет тегов/волны */ }
  const tags = arrayBuffer ? parseId3(arrayBuffer) : null;
  return { arrayBuffer, tags };
}

const prepareOnce = blobUrl => _prepared(blobUrl, () => prepare(blobUrl));

// host - контейнер (.media-frame или .media-embed), blobUrl - расшифрованный файл.
export async function mountVoicePlayer(host, blobUrl){
  setHTML(host, loadingHtml());

  const { arrayBuffer, tags } = await prepareOnce(blobUrl);

  if(tags && (tags.title || tags.artist)){
    mountTrackPlayer(host, blobUrl, tags);
  } else {
    mountWaveformPlayer(host, blobUrl, arrayBuffer);
  }
}

