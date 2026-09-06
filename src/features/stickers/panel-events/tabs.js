// ============ features/stickers/panel-events/tabs.js ============
// Клики по вкладкам паков: удаление пака, открытие модалки добавления,
// переключение текущей вкладки.
import { $ } from '../../../core/dom-utils.js';
import { confirm as confirmModal } from '../../../ui/modals.js';
import { deletePack, listPacks } from '../storage.js';
import { panelState, refreshPanel } from '../panel-state.js';
import { t } from '../../../i18n/t.js';

export function wireTabs(){
  $('sticker-tabs').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.sticker-tab-del');
    if(delBtn){
      e.stopPropagation();
      const packId = delBtn.getAttribute('data-del-pack');
      const packs = await listPacks();
      const pack = packs.find((p) => p.id === packId);
      const ok = await confirmModal(
        t('stickers.deletePackConfirmTitle', { name: pack ? pack.name : '' }),
        t('stickers.deletePackConfirmDesc'));
      if(!ok) return;
      await deletePack(packId);
      if(panelState.currentPackId === packId) panelState.currentPackId = null;
      await refreshPanel();
      return;
    }
    if(e.target.closest('#sticker-add-pack-btn')){
      $('new-pack-modal').classList.add('active');
      $('new-pack-name').focus();
      return;
    }
    const tab = e.target.closest('.sticker-tab');
    if(tab && tab.dataset.packId){
      panelState.currentPackId = tab.dataset.packId;
      await refreshPanel();
    }
  });
}
