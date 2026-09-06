// ============ features/stickers/panel-events/toggle.js ============
// Открытие/закрытие панели стикеров и переключение режима управления.
import { $ } from '../../../core/dom-utils.js';
import { panelState, isPanelOpen, refreshPanel, openPanel, closePanel } from '../panel-state.js';

export function wireToggle(){
  const panel = $('sticker-panel');
  const btn = $('sticker-btn');
  if(!panel || !btn) return false;

  // Как и mic-btn/send-btn (см. features/composer.js) - не перетягиваем
  // фокус с textarea при открытии панели, иначе на телефоне закрывается
  // экранная клавиатура.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => { isPanelOpen() ? closePanel() : openPanel(); });
  $('sticker-panel-close').addEventListener('click', closePanel);

  $('sticker-manage-btn').addEventListener('click', () => {
    panelState.manageMode = !panelState.manageMode;
    $('sticker-manage-btn').classList.toggle('active', panelState.manageMode);
    refreshPanel();
  });

  return true;
}
