// =================== features/stickers/panel-state.js ===================
// Состояние панели стикеров (текущий пак, режим управления) и открытие/
// закрытие/обновление панели.
import { $ } from '../../core/dom-utils.js';
import { uploadAndSend } from '../../net/upload.js';
import { listPacks, listStickers } from './storage.js';
import { renderGridForPack, renderTabsRow, revokeObjectUrls } from './panel-render.js';

export const panelState = {
  currentPackId: null,
  manageMode: false,
};

export function isPanelOpen(){
  const panel = $('sticker-panel');
  return !!panel && panel.style.display !== 'none';
}

export async function refreshPanel(){
  const packs = await listPacks();
  if(!packs.some((p) => p.id === panelState.currentPackId)){
    panelState.currentPackId = packs.length ? packs[0].id : null;
  }
  await renderTabsRow(packs, panelState.currentPackId, panelState.manageMode);
  await renderGridForPack(panelState.currentPackId, panelState.manageMode);
}

export function openPanel(){
  const panel = $('sticker-panel');
  if(!panel) return;
  panel.style.display = 'flex';
  refreshPanel();
}

export function closePanel(){
  const panel = $('sticker-panel');
  if(panel) panel.style.display = 'none';
  revokeObjectUrls();
}

export async function sendStickerById(id){
  if(!panelState.currentPackId) return;
  const stickers = await listStickers(panelState.currentPackId);
  const sticker = stickers.find((s) => s.id === id);
  if(!sticker) return;
  // Префикс "sticker-" в имени файла - маркер для net/media/mime-kind.js:isSticker,
  // чтобы предпросмотр в списке чатов и цитата показывали "Стикер", а не "Фото"
  // (см. features/message-swipe/shared.js:mediaLabel), а фильтр поиска мог
  // отделить стикеры от обычных фото (features/message-search.js).
  const file = new File([sticker.blob], 'sticker-' + sticker.name, {type: sticker.mime});
  // stickerCacheId включает переиспользование ссылки в net/upload.js:
  // при повторной отправке этого же стикера файл не заливается заново.
  await uploadAndSend(file, undefined, {stickerCacheId: sticker.id});
}
