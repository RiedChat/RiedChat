// ===================== ui/voice-player/waveform-peaks.js =====================
// Вычисление амплитудных пиков волны из декодированного аудио.
// Выделено из waveform-player.js: чистая функция arrayBuffer -> Float32Array,
// не зависящая от DOM/canvas.

const BARS = 42;

// Ограничение параллелизма: без него открытие чата с историей из N голосовых
// сообщений без ID3-тегов запускало N decodeAudioData()+суммирование по всем
// сэмплам ПОЧТИ ОДНОВРЕМЕННО (каждый плеер монтируется независимо) - заметный
// джанк главного потока, плюс у Chrome/Safari есть жёсткий лимит на число
// одновременно живых AudioContext (обычно ~6), после которого decodeAudioData
// начинает падать. Простая очередь с ограничением MAX_CONCURRENT достаточна:
// тяжёлая работа остаётся синхронной (Web Worker/OfflineAudioContext - отдельная,
// более крупная переделка), но перестаёт запускаться вся сразу пачкой.
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

function decodePeaks(arrayBuffer){
  return (async () => {
    try{
      if(!arrayBuffer) throw new Error('no data');
      const AC = window.AudioContext || window.webkitAudioContext;
      const tmp = new AC();
      // decodeAudioData может «съедать» буфер в некоторых движках - отдаём копию.
      const decoded = await tmp.decodeAudioData(arrayBuffer.slice(0));
      const data = decoded.getChannelData(0);
      const block = Math.max(1, Math.floor(data.length / BARS));
      const raw = [];
      for(let i = 0; i < BARS; i++){
        let sum = 0;
        const start = i * block, end = Math.min(data.length, start + block);
        for(let j = start; j < end; j++) sum += Math.abs(data[j]);
        raw.push(end > start ? sum / (end - start) : 0);
      }
      const max = Math.max(...raw, 0.0001);
      tmp.close && tmp.close();
      return raw.map(v => Math.max(0.12, v / max));
    }catch(e){
      return Array.from({length: BARS}, (_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i * 12.9898)));
    }
  })();
}

// Возвращает массив из BARS чисел в диапазоне [0.12, 1] - амплитуду
// по блокам сэмплов. При отсутствии данных или ошибке декодирования
// возвращает детерминированную псевдо-волну (не тишину), чтобы плеер
// не выглядел сломанным. Сама тяжёлая работа встаёт в очередь и ждёт
// свободного слота (см. MAX_CONCURRENT выше), если сейчас уже decode'ится
// MAX_CONCURRENT других сообщений.
export function computeWaveformPeaks(arrayBuffer){
  return new Promise(resolve => {
    _queue.push({ arrayBuffer, resolve });
    runNext();
  });
}

