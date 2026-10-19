// ===================== core/persist-storage.js =====================
// Запрос "постоянного" хранилища (StorageManager.persist). Без него
// IndexedDB и localStorage - best-effort: при нехватке места на устройстве
// браузер вытесняет данные источника ЦЕЛИКОМ (история переписки, стикер-паки,
// кэш медиа - всё сразу, "в ноль"). Safari дополнительно чистит данные
// источника после 7 дней без использования, если persist не выдан.
import { debugLog } from './debug-log.js';

let requested = false;

export async function requestPersistentStorage(){
  if(requested) return;
  requested = true;
  try{
    if(typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return;
    if(await navigator.storage.persisted()) return;
    const granted = await navigator.storage.persist();
    debugLog('[storage] persist() ' + (granted ? 'выдано' : 'отклонено браузером'));
    if(!granted) requested = false; // повторим при следующем логине (жест пользователя/вовлечённость могли измениться)
  }catch(e){
    requested = false;
    debugLog('[storage] persist() не удался: ' + (e && e.message ? e.message : e));
  }
}
