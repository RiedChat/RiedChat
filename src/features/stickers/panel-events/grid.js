// ============ features/stickers/panel-events/grid.js ============
// Клики по сетке стикеров: удаление стикера, открытие выбора файла,
// отправка стикера по тапу.
import { $, toast } from '../../../core/dom-utils.js';
import { confirm as confirmModal } from '../../../ui/modals.js';
import { deleteSticker } from '../storage.js';
import { panelState, sendStickerById } from '../panel-state.js';
import { renderGridForPack } from '../panel-render.js';
import { t } from '../../../i18n/t.js';

export function wireGrid(){
  $('sticker-grid').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.sticker-delete');
    if(delBtn){
      e.stopPropagation();
      const ok = await confirmModal(t('stickers.deleteStickerTitle'), t('stickers.deleteStickerDesc'));
      if(!ok) return;
      await deleteSticker(delBtn.getAttribute('data-del-sticker'));
      await renderGridForPack(panelState.currentPackId, panelState.manageMode);
      return;
    }
    if(e.target.closest('#sticker-add-tile')){
      if(!panelState.currentPackId){ toast(t('stickers.createPackFirst')); return; }
      $('sticker-file-input').click();
      return;
    }
    const tile = e.target.closest('.sticker-tile');
    if(tile && tile.dataset.stickerId) await sendStickerById(tile.dataset.stickerId);
  });
}
