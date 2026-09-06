// ============ features/stickers/panel-events/share.js ============
// Поделиться текущим паком: собираем все его стикеры в один zip
// (features/stickers/share.js) и отправляем как обычное вложение -
// получатель увидит карточку "Добавить пак" (features/stickers/pack-card.js).
import { $, toast } from '../../../core/dom-utils.js';
import { listPacks } from '../storage.js';
import { panelState } from '../panel-state.js';
import { buildStickerPackFile } from '../share.js';
import { uploadAndSend } from '../../../net/upload.js';
import { t } from '../../../i18n/t.js';

export function wireShare(){
  const shareBtn = $('sticker-share-btn');
  if(!shareBtn) return;

  shareBtn.addEventListener('mousedown', (e) => e.preventDefault());
  shareBtn.addEventListener('click', async () => {
    if(!panelState.currentPackId){ toast(t('stickers.selectPackFirst')); return; }
    const packs = await listPacks();
    const pack = packs.find((p) => p.id === panelState.currentPackId);
    if(!pack) return;
    shareBtn.disabled = true;
    try{
      const file = await buildStickerPackFile(pack);
      await uploadAndSend(file);
      toast(t('stickers.sentPack', { name: pack.name }));
    }catch(err){
      toast((err && err.message) || t('stickers.sendFailed'));
    }finally{
      shareBtn.disabled = false;
    }
  });
}
