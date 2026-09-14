// ===================== net/history/media-cache.js =====================
// Обёртка над net/media-cache-shared.js (общая логика с
// net/media-worker/media-worker.js) для использования из главного потока:
// постоянный кэш расшифрованных медиа (фото/видео/голосовые), чтобы при
// каждом открытии чата не скачивать и не расшифровывать одни и те же файлы
// заново. Ограничен по суммарному размеру (MEDIA_CACHE_MAX_BYTES) с
// вытеснением самых старых по времени последнего обращения (LRU) - сама
// логика в net/media-cache-shared.js, импортированном напрямую как модуль.
import {
  getMediaEntry as getMediaEntryShared,
  putMediaEntry as putMediaEntryShared,
  evictMediaCache as evictMediaCacheShared,
  clearMediaCache as clearMediaCacheShared,
  hasMediaEntry as hasMediaEntryShared,
} from '../media-cache-shared.js';

export function hasMediaEntry(db, url){
  if(!db) return Promise.resolve(false);
  return hasMediaEntryShared(db, url);
}
export function getMediaEntry(db, url, key){
  if(!db) return Promise.resolve(null);
  return getMediaEntryShared(db, url, key);
}
export function putMediaEntry(db, url, blob, kind, key){
  if(!db) return Promise.resolve();
  return putMediaEntryShared(db, url, blob, kind, key);
}
export function evictMediaCache(db){
  if(!db) return Promise.resolve();
  return evictMediaCacheShared(db);
}
export function clearMediaCache(db){
  if(!db) return Promise.resolve();
  return clearMediaCacheShared(db);
}
