// ===================== ui/voice-player/mount.js =====================
// Точка входа: строит плеер голосового/аудио-сообщения, определяя по
// ID3-тегам (crypto/id3-parser.js), какой из двух режимов монтировать -
// waveform-player.js (обычная запись) или track-player.js (музыкальный файл).
import { html, setHTML } from '../../core/safe-html.js';
import { id3 } from '../../crypto/id3-parser.js';
import { mountWaveformPlayer } from './waveform-player.js';
import { mountTrackPlayer } from './track-player.js';
import { t } from '../../i18n/t.js';

// host - контейнер (.media-frame либо .media-embed), blobUrl - расшифрованный файл.
export async function mountVoicePlayer(host, blobUrl){
  setHTML(host, html`<span class="media-loading">⏳ ${t('media.loading')}</span>`);

  let arrayBuffer = null;
  try{
    const resp = await fetch(blobUrl);
    arrayBuffer = await resp.arrayBuffer();
  }catch(e){ /* переживём - просто не будет тегов/волны */ }

  const tags = arrayBuffer ? id3.parse(arrayBuffer) : null;

  if(tags && (tags.title || tags.artist)){
    mountTrackPlayer(host, blobUrl, tags);
  } else {
    mountWaveformPlayer(host, blobUrl, arrayBuffer);
  }
}

