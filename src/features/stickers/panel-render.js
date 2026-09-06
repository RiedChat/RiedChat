// =================== features/stickers/panel-render.js ===================
// Рендеринг разметки панели стикеров: вкладки паков и грид стикеров.
// blob: URL на пак стикеров живой (не перекодируется через canvas - иначе
// GIF потерял бы анимацию, см. storage.js), поэтому их нужно вручную
// освобождать при каждом перерисовывании грида, иначе течёт память вкладки.
import { $ } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { listStickers } from './storage.js';
import { t } from '../../i18n/t.js';

const objectUrls = new Map(); // stickerId -> blob url

export function revokeObjectUrls(){
  for(const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

function tabHtml(p, currentPackId, manageMode){
  const active = p.id === currentPackId;
  const delBtn = manageMode
    ? html`<span class="sticker-tab-del" data-del-pack="${p.id}" title="${t('stickers.deletePackTitle')}">×</span>`
    : raw('');
  return String(html`<button type="button" class="sticker-tab ${raw(active ? 'active' : '')}" data-pack-id="${p.id}">${p.name}${raw(String(delBtn))}</button>`);
}

function stickerTileHtml(s, manageMode){
  const url = URL.createObjectURL(s.blob);
  objectUrls.set(s.id, url);
  const delBtn = manageMode
    ? html`<button type="button" class="sticker-delete" data-del-sticker="${s.id}" title="${t('stickers.deleteStickerBtnTitle')}">×</button>`
    : raw('');
  return String(html`<div class="sticker-tile" data-sticker-id="${s.id}">
    <img src="${url}" alt="" draggable="false">
    ${raw(String(delBtn))}
  </div>`);
}

export async function renderGridForPack(packId, manageMode){
  revokeObjectUrls();
  const grid = $('sticker-grid');
  if(!grid) return;
  if(!packId){
    setHTML(grid, html`<div class="roster-empty">${t('stickers.noPacksYet')}</div>`);
    return;
  }
  const stickers = await listStickers(packId);
  const addTile = '<div class="sticker-tile sticker-add-tile" id="sticker-add-tile" title="' + t('stickers.addStickerTitle') + '">+</div>';
  setHTML(grid, raw(stickers.map((s) => stickerTileHtml(s, manageMode)).join('') + addTile));
}

export async function renderTabsRow(packs, currentPackId, manageMode){
  const tabsEl = $('sticker-tabs');
  if(!tabsEl) return;
  const addTab = '<button type="button" class="sticker-tab sticker-tab-add" id="sticker-add-pack-btn" title="' + t('stickers.newPackTitle') + '">+</button>';
  setHTML(tabsEl, raw(packs.map((p) => tabHtml(p, currentPackId, manageMode)).join('') + addTab));
}
