// Расшифровка файлов, зашифрованных по XEP-0454 (OMEMO Media Sharing).
// Conversations и другие клиенты, загружая файл через HTTP Upload (XEP-0363),
// шифруют его отдельным одноразовым AES-256-GCM ключом, кладут файл на сервер
// как есть (зашифрованным), а в теле сообщения передают ссылку вида
//   aesgcm://host:port/path#<hex(iv)><hex(key)>
// Ключ и IV лежат прямо в hex во фрагменте (после #), сам файл нужно скачать
// по обычному https:// (просто заменив схему) и расшифровать в браузере.
//
// ВАЖНО: скачивание, расшифровка и запись в постоянный кэш (IndexedDB)
// выполняются не здесь, а в отдельном Web Worker'е (net/media-worker/media-worker.js) через
// net/media/worker-client.js. Определение типа/расширения файла вынесено в
// net/media/mime-kind.js. Здесь остаётся только in-memory кэш и бизнес-логика
// (primeLocalBlob/decrypt).
import { debugLog } from '../core/debug-log.js';
import { history } from './history.js';
import { state } from '../core/state.js';
import { kindOfMime, extOf, kindOf, isVideoNote, isSticker, isStickerPack } from './media/mime-kind.js';
import { request, requestFireAndForget } from './media/worker-client.js';
import { extractThumbDataUrl } from './media/thumb-codec.js';

// Кэш в памяти вкладки, чтобы одну и ту же ссылку не расшифровывать повторно
// при каждом рендере списка сообщений (переключение чатов туда-обратно и т.п.).
const cache = new Map(); // aesgcmUrl -> {status:'loading'|'done'|'error', blobUrl, kind, promise, progressListeners}

function currentDbName(){
  return (history && history.dbName) || null;
}

export const media = {
  // Необязательный ';t=<base64url>' хвост после hex-ключа - встроенное
  // превью-кадра (см. net/media/thumb-codec.js и net/upload.js). ';' не
  // входит в hex-алфавит, поэтому старые ссылки без превью по-прежнему
  // матчатся ровно так же, как раньше.
  AESGCM_RE: /aesgcm:\/\/[^\s#]+#[0-9a-fA-F]+(?:;t=[A-Za-z0-9_-]+)?/g,

  kindOfMime, extOf, kindOf, isVideoNote, isSticker, isStickerPack,

  // Достаёт встроенное превью-кадра прямо из ссылки, без сети и без
  // расшифровки вложения - см. ui/chat-view/media-loader.js.
  extractThumbDataUrl,

  isAesgcm(url){ return /^aesgcm:\/\//i.test(url); },

  getCached(url){ return cache.get(url); },

  // Вызывается СРАЗУ после успешной отправки своего файла (net/upload.js), пока
  // у нас на руках ещё есть оригинальный (расшифрованный) File - вместо того,
  // чтобы при следующем рендере этого же сообщения качать его обратно с сервера
  // и заново расшифровывать AES-GCM, как для чужого входящего файла. Экономит
  // и трафик, и время, и не показывает "⏳ загрузка медиа…" на только что
  // отправленном пользователем же файле.
  primeLocalBlob(url, file){
    if(!url || !file) return;
    try{
      const kind = kindOfMime(file.type) || kindOf(extOf(file.name || '')) || 'file';
      const blobUrl = URL.createObjectURL(file);
      cache.set(url, { status:'done', blobUrl, kind, progressListeners: [] });

      // Фоново пишем в постоянный кэш через воркер - размер файла тут
      // больше не важен: запись идёт в отдельном потоке и не может
      // задержать обработку WebSocket/отправку сообщений в главном.
      const dbName = currentDbName();
      if(dbName){
        try{
          requestFireAndForget({ type:'store', url, blob: file, kind, dbName });
        }catch(e){
          debugLog('[media] не удалось отправить файл в воркер для кэширования: ' + (e && e.message ? e.message : e));
        }
      }
    }catch(e){
      console.warn('media: не удалось закэшировать локально отправленный файл', e);
    }
  },

  // senderJid - bareJid отправителя этого конкретного сообщения (свой
  // же исходящий файл - undefined/наш собственный, тогда достаточно
  // allowedHosts). Нужен, чтобы доверять upload-хосту собеседника (TOFU,
  // тот же принцип, что и у identity-ключей OMEMO) - иначе скачивание
  // зашифрованных вложений с чужого сервера всегда отваливалось бы, см.
  // комментарий в net/media-worker/fetch-decrypt.js.
  async decrypt(aesgcmUrl, onProgress, senderJid){
    if(cache.has(aesgcmUrl)){
      const c = cache.get(aesgcmUrl);
      if(c.status === 'done' || c.status === 'error') return c;
      if(onProgress) c.progressListeners.push(onProgress);
      return c.promise;
    }
    const entry = { status:'loading', progressListeners: onProgress ? [onProgress] : [] };
    cache.set(aesgcmUrl, entry);
    const promise = (async () => {
      try{
        const dbName = currentDbName();
        // Воркер живёт в отдельном модульном графе и не видит мутаций
        // основного объекта state (uploadComponentJid/trustedUploadHosts
        // заполняются здесь, на главном потоке) - поэтому allowlist
        // передаём явно с каждым запросом, а не импортируем state в воркере.
        const allowedHosts = state.trustedUploadHosts.slice();
        // Strophe.getDomainFromJid доступен только в главном потоке -
        // домен считаем здесь и передаём воркеру уже готовой строкой.
        let senderDomain = null;
        // Невалидный/неполный JID не должен рвать расшифровку файла -
        // senderDomain лишь уточняет allowlist на стороне воркера, при
        // ошибке парсинга просто остаётся null (доверяем только putHost).
        try{ senderDomain = senderJid ? Strophe.getDomainFromJid(senderJid) : null; }catch(e){}
        const msg = await request(
          { type:'decrypt', url: aesgcmUrl, dbName, allowedHosts, senderDomain },
          // Слушатель прогресса - чужой код (UI-компонент могли уже
          // размонтировать); исключение в нём не должно прерывать сам
          // decrypt-запрос к воркеру.
          (pct) => entry.progressListeners.forEach(fn => { try{ fn(pct); }catch(e){} })
        );
        if(!msg.ok) throw new Error(msg.error || 'не удалось расшифровать медиа');

        entry.status = 'done';
        entry.blobUrl = URL.createObjectURL(msg.blob);
        entry.kind = msg.kind;
        return entry;
      }catch(e){
        console.error('aesgcm: ошибка расшифровки медиа', aesgcmUrl, e);
        entry.status = 'error';
        entry.error = e;
        return entry;
      }
    })();
    entry.promise = promise;
    return promise;
  }
};

// media доступна через `import { media } from './media.js'` - все текущие
// потребители (net/upload.js, ui/chat-view/*) уже переведены на реальный
// import, поэтому window.App-мост здесь не нужен.
