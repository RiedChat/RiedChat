// ===================== features/stickers/panel.js =====================
// Точка входа панели стикеров: открывается кнопкой рядом с 🎤 в композере,
// поднимается НАД строкой ввода (см. index.html - #sticker-panel идёт перед
// #composer-text внутри того же flex-column #composer). Логика разбита на:
//  - panel-render.js - рендеринг вкладок и грида
//  - panel-state.js  - состояние, открытие/закрытие/обновление
//  - panel-events.js - обработчики событий
export { wireStickers } from './panel-events.js';
