// ============ features/stickers/panel-events/file-input.js ============
// Загрузка выбранных файлов как новых стикеров текущего пака.
import { $, toast } from '../../../core/dom-utils.js';
import { addSticker } from '../storage.js';
import { panelState } from '../panel-state.js';
import { renderGridForPack } from '../panel-render.js';
import { t } from '../../../i18n/t.js';

export function wireFileInput(){
  $('sticker-file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // повторный выбор тех же файлов должен снова сработать
    if(!files.length || !panelState.currentPackId) return;
    let added = 0;
    for(const f of files){
      try{ await addSticker(panelState.currentPackId, f); added++; }
      catch(err){ toast((err && err.message) || t('stickers.addStickerFailed')); }
    }
    if(added) toast(added > 1 ? t('stickers.addedCount', {count: added}) : t('stickers.oneAdded'));
    await renderGridForPack(panelState.currentPackId, panelState.manageMode);
  });
}
