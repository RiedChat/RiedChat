// =================== features/stickers/panel-render.js ===================
// Рендер вкладок паков и грида. blob: URL не перекодируются (иначе GIF теряет анимацию),
// поэтому освобождаются вручную при каждой перерисовке грида.
import { $ } from '../../core/dom-utils.js';
import { cx, html, setHTML } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';

import { listStickers } from './storage/stickers.js';

const objectUrls = new Map(); // stickerId -> blob url

export function revokeObjectUrls(){
  for(const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

function tabHtml(p, currentPackId, manageMode){
  const active = p.id === currentPackId;
  const delBtn = manageMode
    ? html`<span class="sticker-tab-del" data-del-pack="${p.id}" title="${t('stickers.deletePackTitle')}">×</span>`
    : '';
  return html`<button type="button" class="${cx('sticker-tab', active && 'active')}" data-pack-id="${p.id}">${p.name}${delBtn}</button>`;
}

function stickerTileHtml(s, manageMode){
  const url = URL.createObjectURL(s.blob);
  objectUrls.set(s.id, url);
  const delBtn = manageMode
    ? html`<button type="button" class="sticker-delete" data-del-sticker="${s.id}" title="${t('stickers.deleteStickerBtnTitle')}">×</button>`
    : '';
  return html`<div class="sticker-tile" data-sticker-id="${s.id}">
    <img src="${url}" alt="" draggable="false">
    ${delBtn}
  </div>`;
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
  const addTile = html`<div class="sticker-tile sticker-add-tile" id="sticker-add-tile" title="${t('stickers.addStickerTitle')}">+</div>`;
  setHTML(grid, html`${stickers.map((s) => stickerTileHtml(s, manageMode))}${addTile}`);
}

export function renderTabsRow(packs, currentPackId, manageMode){
  const tabsEl = $('sticker-tabs');
  if(!tabsEl) return;
  const addTab = html`<button type="button" class="sticker-tab sticker-tab-add" id="sticker-add-pack-btn" title="${t('stickers.newPackTitle')}">+</button>`;
  setHTML(tabsEl, html`${packs.map((p) => tabHtml(p, currentPackId, manageMode))}${addTab}`);
}
