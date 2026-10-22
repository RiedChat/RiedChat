// ===================== features/stickers/panel-events.js =====================
// События панели: открытие/закрытие, режим управления, отправка/создание пака, вкладки, сетка, загрузка файлов.
import { $, toast, keepFocus, wireFilePicker, wireModalDismiss } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';
import { uploadAndSend } from '../../net/upload.js';
import { confirmDialog } from '../../ui/confirm-modal.js';

import {
  panelState, isPanelOpen, refreshPanel, refreshGrid, openPanel, closePanel, sendStickerById,
} from './panel-state.js';
import { buildStickerPackFile } from './share.js';
import { getPack, createPack, deletePack } from './storage/packs.js';
import { addSticker, deleteSticker } from './storage/stickers.js';

// ---- открытие/закрытие панели и режим управления ----
function wireToggle(){
  const btn = $('sticker-btn');

  // Не перетягиваем фокус с textarea (как mic-btn/send-btn), иначе закрывается экранная клавиатура.
  keepFocus(btn);
  btn.addEventListener('click', () => { isPanelOpen() ? closePanel() : openPanel(); });
  $('sticker-panel-close').addEventListener('click', closePanel);

  const manageBtn = $('sticker-manage-btn');
  manageBtn.addEventListener('click', () => {
    panelState.manageMode = !panelState.manageMode;
    manageBtn.classList.toggle('active', panelState.manageMode);
    refreshPanel();
  });
}

// ---- поделиться текущим паком ----
// JSON со всеми стикерами пака уходит обычным вложением; получатель видит карточку (./pack-card.js).
function wireShare(){
  const shareBtn = $('sticker-share-btn');

  keepFocus(shareBtn);
  shareBtn.addEventListener('click', async () => {
    if(!panelState.currentPackId){ toast(t('stickers.selectPackFirst')); return; }
    const pack = await getPack(panelState.currentPackId);
    if(!pack) return;
    shareBtn.disabled = true;
    try{
      const file = await buildStickerPackFile(pack);
      await uploadAndSend(file);
      toast(t('stickers.sentPack', { name: pack.name }));
    }catch(err){
      toast(err?.message || t('stickers.sendFailed'));
    }finally{
      shareBtn.disabled = false;
    }
  });
}

// ---- модалка создания пака ----
function wirePackModal(){
  const closeNewPackModal = wireModalDismiss('new-pack-modal');
  const confirmNewPack = async () => {
    const name = $('new-pack-name').value.trim();
    const pack = await createPack(name);
    panelState.currentPackId = pack.id;
    $('new-pack-name').value = '';
    closeNewPackModal();
    await refreshPanel();
  };
  $('new-pack-confirm').addEventListener('click', confirmNewPack);
  $('new-pack-name').addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); confirmNewPack(); }
  });
}

// ---- вкладки паков: удаление, добавление, переключение ----
function wireTabs(){
  $('sticker-tabs').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.sticker-tab-del');
    if(delBtn){
      e.stopPropagation();
      const packId = delBtn.getAttribute('data-del-pack');
      const pack = await getPack(packId);
      const ok = await confirmDialog(
        t('stickers.deletePackConfirmTitle', { name: pack?.name ?? '' }),
        t('stickers.deletePackConfirmDesc'));
      if(!ok) return;
      await deletePack(packId);
      if(panelState.currentPackId === packId) panelState.currentPackId = null;
      await refreshPanel();
      return;
    }
    if(e.target.closest('#sticker-add-pack-btn')){
      $('new-pack-modal').showModal();
      $('new-pack-name').focus();
      return;
    }
    const tab = e.target.closest('.sticker-tab');
    if(tab?.dataset.packId){
      panelState.currentPackId = tab.dataset.packId;
      await refreshPanel();
    }
  });
}

// ---- сетка стикеров: удаление, открытие выбора файла, отправка по тапу ----
function wireGrid(){
  $('sticker-grid').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.sticker-delete');
    if(delBtn){
      e.stopPropagation();
      const ok = await confirmDialog(t('stickers.deleteStickerTitle'), t('stickers.deleteStickerDesc'));
      if(!ok) return;
      await deleteSticker(delBtn.getAttribute('data-del-sticker'));
      await refreshGrid();
      return;
    }
    if(e.target.closest('#sticker-add-tile')){
      if(!panelState.currentPackId){ toast(t('stickers.createPackFirst')); return; }
      $('sticker-file-input').click();
      return;
    }
    const tile = e.target.closest('.sticker-tile');
    if(tile?.dataset.stickerId) await sendStickerById(tile.dataset.stickerId);
  });
}

// ---- загрузка выбранных файлов как новых стикеров текущего пака ----
function wireFileInput(){
  // Input открывает плитка "+" в сетке (wireGrid).
  wireFilePicker(null, 'sticker-file-input', async (files) => {
    if(!panelState.currentPackId) return;
    let added = 0;
    for(const f of files){
      try{ await addSticker(panelState.currentPackId, f); added++; }
      catch(err){ toast(err?.message || t('stickers.addStickerFailed')); }
    }
    if(added) toast(added > 1 ? t('stickers.addedCount', {count: added}) : t('stickers.oneAdded'));
    await refreshGrid();
  });
}

export function wirePanelEvents(){
  wireToggle();
  wireShare();
  wirePackModal();
  wireTabs();
  wireGrid();
  wireFileInput();
}
