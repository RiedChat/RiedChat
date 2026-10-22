// ===================== ui/voice-player/waveform-peaks.js =====================
// Амплитудные пики из декодированного аудио: чистая функция arrayBuffer -> Float32Array, без DOM/canvas.

const BARS = 42;

// Ограничение параллелизма: без него чат с N голосовыми без ID3 запускал N decodeAudioData()+суммирований почти одновременно (джанк главного потока), а у Chrome/Safari лимит живых AudioContext (~6), после которого decodeAudioData падает. Очередь с MAX_CONCURRENT достаточна: работа остаётся синхронной (Web Worker/OfflineAudioContext - отдельная переделка), но не стартует пачкой.
const MAX_CONCURRENT = 3;
let _active = 0;
const _queue = [];

function runNext(){
  if(_active >= MAX_CONCURRENT || _queue.length === 0) return;
  _active++;
  const { arrayBuffer, resolve } = _queue.shift();
  decodePeaks(arrayBuffer).then(resolve).finally(() => {
    _active--;
    runNext();
  });
}

// Контекст закрывается в finally, в том числе при исключении decodeAudioData: иначе утечка AudioContext и исчерпание лимита (~6).
async function decodePeaks(arrayBuffer){
  let ctx = null;
  try{
    if(!arrayBuffer) throw new Error('no data');
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    // decodeAudioData в некоторых движках «съедает» буфер - отдаём копию.
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = decoded.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / BARS));
    const peaks = [];
    for(let i = 0; i < BARS; i++){
      let sum = 0;
      const start = i * block, end = Math.min(data.length, start + block);
      for(let j = start; j < end; j++) sum += Math.abs(data[j]);
      peaks.push(end > start ? sum / (end - start) : 0);
    }
    const max = Math.max(...peaks, 0.0001);
    return peaks.map(v => Math.max(0.12, v / max));
  }catch{
    return Array.from({length: BARS}, (_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i * 12.9898)));
  }finally{
    if(ctx?.close) ctx.close().catch(() => {});
  }
}

// Возвращает BARS чисел в [0.12, 1] - амплитуду по блокам сэмплов. Без данных или при ошибке декодирования - детерминированная псевдо-волна (не тишина), чтобы плеер не выглядел сломанным. Работа ждёт слот очереди (MAX_CONCURRENT).
export function computeWaveformPeaks(arrayBuffer){
  return new Promise(resolve => {
    _queue.push({ arrayBuffer, resolve });
    runNext();
  });
}

