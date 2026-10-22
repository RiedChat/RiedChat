// =================== features/stickers/panel-state.js ===================
// Состояние панели (текущий пак, режим управления), открытие/закрытие/обновление.
import { $ } from '../../core/dom-utils.js';
import { uploadAndSend } from '../../net/upload.js';

import { renderGridForPack, renderTabsRow, revokeObjectUrls } from './panel-render.js';
import { listPacks } from './storage/packs.js';
import { getSticker } from './storage/stickers.js';

export const panelState = {
  currentPackId: null,
  manageMode: false,
};

export function isPanelOpen(){
  const panel = $('sticker-panel');
  return !!panel && !panel.hidden;
}

// Перерисовывает грид текущего пака.
export const refreshGrid = () => renderGridForPack(panelState.currentPackId, panelState.manageMode);

export async function refreshPanel(){
  const packs = await listPacks();
  if(!packs.some((p) => p.id === panelState.currentPackId)){
    panelState.currentPackId = packs.length ? packs[0].id : null;
  }
  renderTabsRow(packs, panelState.currentPackId, panelState.manageMode);
  await refreshGrid();
}

export function openPanel(){
  const panel = $('sticker-panel');
  if(!panel) return;
  panel.hidden = false;
  refreshPanel();
}

export function closePanel(){
  const panel = $('sticker-panel');
  if(panel) panel.hidden = true;
  revokeObjectUrls();
}

export async function sendStickerById(id){
  if(!panelState.currentPackId) return;
  const sticker = await getSticker(id);
  if(!sticker) return;
  // Префикс "sticker-" - маркер для net/media/mime-kind.js:isSticker (метка "Стикер" в превью/цитате, фильтр поиска).
  const file = new File([sticker.blob], 'sticker-' + sticker.name, {type: sticker.mime});
  // stickerCacheId: повторная отправка не перезаливает файл (net/upload.js).
  await uploadAndSend(file, undefined, {stickerCacheId: sticker.id});
}
