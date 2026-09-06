// ===================== net/media/worker-client.js =====================
// Обёртка над Web Worker'ом (net/media-worker/media-worker.js), который
// скачивает, расшифровывает и кэширует файлы в IndexedDB. Выделено из
// net/media.js - здесь только протокол общения с воркером (создание,
// роутинг сообщений по reqId, счётчик запросов), без бизнес-логики
// decrypt/primeLocalBlob.
import { debugLog } from '../../core/debug-log.js';

let worker = null;
let reqCounter = 0;
const pending = new Map(); // reqId -> {resolve, onProgress}

function getWorker(){
  if(!worker){
    // Паттерн new Worker(new URL(...), {type:'module'}) - Vite распознаёт
    // его при сборке и бандлит воркер вместе со всеми его import'ами в
    // отдельный минифицированный чанк (а не в public/ как раньше).
    worker = new Worker(new URL('../media-worker/media-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      const p = pending.get(msg.reqId);
      if(!p) return;
      if(msg.type === 'progress'){
        if(typeof msg.pct === 'number') p.onProgress?.(msg.pct);
        return;
      }
      if(msg.type === 'cache-write-error'){
        // Не критично для пользователя (файл уже показан) - просто в лог.
        debugLog('[media] воркер не смог записать постоянный кэш: ' + msg.error);
        return;
      }
      if(msg.type === 'result' || msg.type === 'stored'){
        pending.delete(msg.reqId);
        p.resolve(msg);
      }
    };
    worker.onerror = (e) => {
      debugLog('[media] ошибка воркера: ' + (e && e.message ? e.message : e));
    };
  }
  return worker;
}

function nextReqId(){
  return 'r' + (++reqCounter);
}

// Отправляет сообщение воркеру и возвращает промис, который резолвится
// сообщением типа 'result'/'stored'. onProgress вызывается на каждое
// промежуточное 'progress'-сообщение с тем же reqId.
export function request(payload, onProgress){
  const reqId = nextReqId();
  const promise = new Promise((resolve) => {
    pending.set(reqId, { resolve, onProgress: onProgress || null });
  });
  getWorker().postMessage(Object.assign({ reqId }, payload));
  return promise;
}

// Fire-and-forget запрос (например, фоновая запись в кэш, где результат
// никого не интересует) - резолвер пустой, но reqId всё равно нужен
// воркеру, чтобы не потерять cache-write-error в общем onmessage.
export function requestFireAndForget(payload){
  const reqId = nextReqId();
  pending.set(reqId, { resolve(){}, onProgress: null });
  try{
    getWorker().postMessage(Object.assign({ reqId }, payload));
  }catch(e){
    pending.delete(reqId);
    throw e;
  }
}
