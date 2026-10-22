// ===================== features/video-note/state.js =====================
// Общее состояние записи кружка для модулей video-note/*. Один объект, а не отдельные `let`-экспорты: значения меняются в recording.js, camera.js, preview.js, и переприсваивание видно всем модулям.

export const MAX_DURATION_MS = 60000;
export const CANVAS_SIZE = 480;

export const S = {
  mediaRecorder: null,
  chunks: [],
  stream: null, // поток камера+микрофон (видеотрек подменяется при смене камеры)
  canvasEl: null, // скрытый канвас-источник для MediaRecorder
  canvasCtx: null,
  canvasStream: null, // captureStream() канваса + аудиотрек из stream; его пишет MediaRecorder
  rafHandle: null,
  currentFacingMode: 'user',
  timerHandle: null,
  autoStopHandle: null,
  startedAt: 0,
  discardOnStop: false,
  recordedBlob: null,
  recordedUrl: null,
  // Превью-кадр кружка (base64url JPEG), снятый с канваса записи при остановке (recording-stop.js); уходит с сообщением (net/upload.js), а не извлекается из webm.
  recordedThumbB64url: null,
};
