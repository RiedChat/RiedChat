// ======= features/message-edit/mouse-buttons.js =======
// На ПК - редактирование запускается, если зажать ОБЕ кнопки мыши (левую и
// правую) одновременно над сообщением: e.buttons - битовая маска реально
// зажатых сейчас кнопок (1 - левая, 2 - правая), проверяем на mousedown,
// когда становятся зажаты сразу обе (не важно, в каком порядке их нажали).
// Правая кнопка при этом обычно открывает контекстное меню браузера -
// подавляем его отдельным обработчиком 'contextmenu', но только когда
// комбинация реально сработала (обычный клик правой кнопкой саму по себе
// не трогаем).
import { msgByRow, startEdit } from './core.js';

export function wireBothButtonsEdit(container){
  let suppressNextContextMenu = false;

  container.addEventListener('mousedown', (e) => {
    if(e.buttons !== 3) return; // не (левая+правая) зажаты одновременно
    const row = e.target.closest('.msg-row');
    if(!row) return;
    suppressNextContextMenu = true;
    const msg = msgByRow(row);
    const bubble = row.querySelector('.bubble');
    if(!msg || !bubble) return;
    startEdit(msg, bubble);
  });

  container.addEventListener('contextmenu', (e) => {
    if(!suppressNextContextMenu) return;
    suppressNextContextMenu = false;
    e.preventDefault();
  });

  // Кнопки могли отпустить не над строкой (увели мышь в сторону) - слушаем
  // на всём документе, а не только на контейнере сообщений.
  document.addEventListener('mouseup', (e) => {
    if(e.buttons === 0) suppressNextContextMenu = false;
  });
}
