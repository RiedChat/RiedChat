// ============ features/stickers/panel-events/pack-modal.js ============
// Модалка создания нового пака стикеров.
import { $, wireModalDismiss } from '../../../core/dom-utils.js';
import { createPack } from '../storage.js';
import { panelState, refreshPanel } from '../panel-state.js';

export function wirePackModal(){
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
