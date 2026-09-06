// ===================== features/video-note/state.js =====================
// Общее мутируемое состояние записи кружка, расшаренное между модулями
// video-note/*. Единый объект, а не набор отдельных `let`-экспортов -
// значения меняются во многих местах (recording.js, camera.js, preview.js),
// и через объект переприсваивание видно во всех модулях сразу, а не только
// в том, что импортировал значение по значению в момент импорта.

export const MAX_DURATION_MS = 60000;
export const CANVAS_SIZE = 480;

export const S = {
  mediaRecorder: null,
  chunks: [],
  stream: null,        // текущий поток камера+микрофон (видеотрек подменяется при переключении камеры)
  canvasEl: null,       // скрытый канвас-источник для MediaRecorder
  canvasCtx: null,
  canvasStream: null,   // captureStream() канваса + аудиотрек из stream - именно ЕГО пишет MediaRecorder
  rafHandle: null,
  currentFacingMode: 'user',
  timerHandle: null,
  autoStopHandle: null,
  startedAt: 0,
  discardOnStop: false,
  recordedBlob: null,
  recordedUrl: null,
  // Превью-кадр (base64url JPEG) кружка, снятый ПРЯМО С КАНВАСА записи в
  // момент остановки (см. recording-stop.js) - уходит вместе с сообщением
  // (net/upload.js), а не выковыривается потом из готового webm.
  recordedThumbB64url: null,
};
