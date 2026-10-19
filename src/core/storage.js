// ===================== core/storage.js =====================
// Общие хелперы для чтения/записи localStorage. Раньше в net/vcard.js,
// net/connection.js, features/profile.js, features/font-settings/storage.js каждый
// try{ JSON.parse(localStorage.getItem(key) || 'default') }catch(e){} и
// try{ localStorage.setItem(...) }catch(e){} были продублированы по месту -
// вынесено сюда в двух функциях.
import { state } from './state.js';
import { t } from '../i18n/t.js';

// Возвращает fallback, если ключа нет, JSON битый, либо localStorage
// недоступен (приватный режим, quota и т.п.).
export function lsGet(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }catch(e){ return fallback; }
}

// Кэши, которые можно безболезненно потерять: при нехватке места в
// localStorage они удаляются первыми, чтобы освободить место под важные
// записи (vault-блок с data-key'ями истории, настройки). Аватары контактов
// перекачиваются из vCard при следующем presence.
const EVICTABLE_LS_PREFIXES = ['xmppContactAvatar_'];

export function isQuotaError(e){
  if(!e) return false;
  return e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22 || e.code === 1014
    || /quota/i.test(e.message || '');
}

function freeLocalStorageSpace(exceptKey){
  let freed = false;
  for(let i = localStorage.length - 1; i >= 0; i--){
    const k = localStorage.key(i);
    if(k && k !== exceptKey && EVICTABLE_LS_PREFIXES.some(p => k.startsWith(p))){
      localStorage.removeItem(k);
      freed = true;
    }
  }
  return freed;
}

// Пишет в localStorage; при QuotaExceededError удаляет вытесняемые кэши и
// повторяет запись один раз. Бросает исключение, если записать не удалось.
function writeWithEviction(key, value){
  const raw = JSON.stringify(value);
  try{
    localStorage.setItem(key, raw);
  }catch(e){
    if(!isQuotaError(e) || !freeLocalStorageSpace(key)) throw e;
    localStorage.setItem(key, raw);
  }
}

// Best-effort: возвращает true/false - записалось или нет. Вызывающий код,
// для которого потеря записи критична, ОБЯЗАН проверять результат.
export function lsSet(key, value){
  try{ writeWithEviction(key, value); return true; }
  catch(e){ return false; }
}

// Для критичных данных (vault-блок с ключами): бросает исключение при
// неудаче, чтобы никто не считал данные сохранёнными, когда это не так.
export function lsSetStrict(key, value){
  writeWithEviction(key, value);
}

export function lsRemove(key){
  // См. lsSet - недоступность localStorage тут не критична: раз запись не
  // сохранилась, удалять по факту нечего.
  try{ localStorage.removeItem(key); }catch(e){}
}

// Ключ, привязанный к текущему аккаунту (S.myBareJid) - используется для
// всех настроек/кэшей, которые не должны утекать между разными аккаунтами
// на одном устройстве (профиль, обои, lastSeen, lastScreen и т.п.).
export function accountKey(prefix){
  return prefix + '_' + (state.myBareJid || '');
}

// Открывает IndexedDB-базу с защитой от "тихого" зависания: если другая
// вкладка/окно держит открытым соединение к старой версии той же базы,
// апгрейд блокируется браузером и ни onupgradeneeded, ни onsuccess, ни
// onerror не срабатывают, пока то соединение не закроется. Раньше это
// выглядело как бесконечное "устанавливаем соединение..." - теперь через
// timeoutMs (по умолчанию 8с) промис отклоняется явной ошибкой, а
// opts.onBlocked (если передан) даёт знать пользователю раньше таймаута.
//
// opts:
//   onUpgrade(db)     - вызывается из onupgradeneeded, создать object store'ы
//   onBlocked()        - вызывается из onblocked (лог/toast), необязательно
//   timeoutMs           - таймаут, по умолчанию 8000
//   timeoutMessage      - текст ошибки при таймауте
export function openIndexedDb(dbName, version, opts){
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    let settled = false;
    const timeoutId = setTimeout(() => {
      if(settled) return;
      settled = true;
      reject(new Error(opts.timeoutMessage || t('common.dbTimeoutFallback', {dbName})));
    }, opts.timeoutMs || 8000);

    req.onblocked = () => { if(opts.onBlocked) opts.onBlocked(); };
    req.onupgradeneeded = () => { if(opts.onUpgrade) opts.onUpgrade(req.result); };
    req.onsuccess = () => {
      clearTimeout(timeoutId);
      if(settled){ try{ req.result.close(); }catch(e){} return; } // таймаут уже сработал раньше - просто закрываем опоздавшее соединение; сорвавшийся close() ни на что уже не влияет, вызывающий код давно получил reject
      settled = true;
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timeoutId);
      if(settled) return;
      settled = true;
      reject(req.error);
    };
  });
}
