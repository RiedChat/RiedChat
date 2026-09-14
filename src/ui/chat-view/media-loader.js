// ===================== ui/chat-view/media-loader.js =====================
// Скачивание/расшифровка медиа-вложений сообщений и подмена плейсхолдеров
// на реальный контент. Реализация разбита на модули в ./media-loader/ -
// этот файл остаётся точкой входа, чтобы не менять пути импорта в
// render-messages.js и main.js.
export { loadEncryptedMedia } from './media-loader/encrypted-media.js';
export { _loadMediaOrDeferForVideo } from './media-loader/video-defer.js';
export { loadPlainImage } from './media-loader/plain-image.js';
export { loadQuoteThumb, _loadQuoteThumbOrDefer } from './media-loader/quote-thumb.js';
