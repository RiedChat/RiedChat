// =================== features/stickers/panel-events.js ===================
// Обработчики событий панели стикеров: открытие/закрытие, управление паками
// и стикерами, отправка стикера, загрузка файлов.
// Реализация разбита по подмодулям в ./panel-events/*.
import { wireToggle } from './panel-events/toggle.js';
import { wireShare } from './panel-events/share.js';
import { wirePackModal } from './panel-events/pack-modal.js';
import { wireTabs } from './panel-events/tabs.js';
import { wireGrid } from './panel-events/grid.js';
import { wireFileInput } from './panel-events/file-input.js';

export function wireStickers(){
  if(!wireToggle()) return;
  wireShare();
  wirePackModal();
  wireTabs();
  wireGrid();
  wireFileInput();
}
