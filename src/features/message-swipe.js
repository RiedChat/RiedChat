// ===================== features/message-swipe.js =====================
// Свайп по сообщению (как в Telegram):
//  - свайп СПРАВА НАЛЕВО  -> цитировать сообщение (плашка "Ответ ..." над полем ввода,
//    при отправке текст цитаты подставляется в начало сообщения - см. buildQuotedBody
//    в net/messaging/outgoing.js и рендер цитаты в ui/chat-view/render-messages.js).
//  - свайп СЛЕВА НАПРАВО  -> для текстового сообщения копирует его текст в буфер обмена;
//    для сообщения-медиа (фото/видео/голосовое/файл) - скачивает файл.
// Сама жестовая механика (Pointer Events, transform, hint-иконки) вынесена
// в ui/swipe-gesture.js - здесь только то, что означает свайп для сообщения.
//
// Реализация разбита на модули в ./message-swipe/:
//  - shared.js         - KIND_LABEL и msgByRow, общие для остальных модулей
//  - quote.js           - startReply (свайп -> цитировать)
//  - copy-download.js   - swipeAction (свайп -> копировать/скачать)
//  - wire.js             - wireMessageSwipe (навешивание жеста)
// Этот файл - публичная точка входа, путь и экспорты не изменились.
export { KIND_LABEL, mediaLabel } from './message-swipe/shared.js';
export { startReply } from './message-swipe/quote.js';
export { swipeAction } from './message-swipe/copy-download.js';
export { wireMessageSwipe } from './message-swipe/wire.js';
