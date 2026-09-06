// ===================== features/voice-recorder/format.js =====================
// Мелкие форматирующие хелперы записи голосового: выбор поддерживаемого
// mime-типа для MediaRecorder и форматирование прошедшего времени mm:ss.
export function pickMimeType(){
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for(const t of candidates){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function fmtTime(ms){
  const s = Math.floor(ms/1000);
  const mm = Math.floor(s/60);
  const ss = String(s % 60).padStart(2,'0');
  return mm + ':' + ss;
}
