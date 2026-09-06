// ===================== features/stickers/storage.js =====================
// Хранилище стикер-паков: IndexedDB на устройстве (не привязано к аккаунту -
// как и загруженный шрифт в features/font-settings/storage.js, это то, что
// пользователь один раз собрал у себя на телефоне/в браузере и хочет видеть
// в любом чате с любого аккаунта на этом устройстве).
//
// Два object store:
//  'packs'    - {id, name, ts}
//  'stickers' - {id, packId, blob, mime, name, ts}, индекс по packId.
//
// Сама картинка хранится КАК ЕСТЬ (Blob, без перекодирования через canvas) -
// как и в features/wallpaper для GIF-обоев (core/image-utils.js:readFileAsDataUrl):
// перерисовка на canvas убивает анимацию GIF, а сюда как раз можно грузить GIF.
//
// Реализация разбита на модули в ./storage/:
//  db.js       - подключение к IndexedDB, обёртки reqToPromise/txDone
//  types.js    - разрешённые типы файлов, extOf/stickerKindOf, MAX_STICKER_BYTES
//  packs.js    - CRUD над паками
//  stickers.js - CRUD над стикерами внутри пака
// Этот файл - просто публичный барабан-реэкспорт, чтобы существующие
// импорты `from './storage.js'` не менялись.
export { ALLOWED_STICKER_TYPES, MAX_STICKER_BYTES, extOf, stickerKindOf } from './storage/types.js';
export { listPacks, createPack, renamePack, deletePack } from './storage/packs.js';
export { listStickers, addSticker, deleteSticker } from './storage/stickers.js';
