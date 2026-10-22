// ===================== features/stickers/pack-card.js =====================
// Карточка "пак стикеров" в сообщении: скачать/расшифровать JSON (share.js), разобрать,
// показать превью первого стикера, название пака и кнопку "Добавить".
// Кнопка недоступна, если пак с таким названием уже есть (isNameTaken).
import { toast } from '../../core/dom-utils.js';
import { cx, html, raw, setHTML } from '../../core/safe-html.js';
import { bufFromB64 } from '../../crypto/bytes.js';
import { t } from '../../i18n/t.js';
import { isAesgcm } from '../../net/media/mime-kind.js';
import { media } from '../../net/media.js';

import { listPacks, createPack } from './storage/packs.js';
import { addSticker } from './storage/stickers.js';
import { stickerMimeOf } from './storage/types.js';


// JSON из share.js: { name, stickers: [{ name, type, b64 }] }.
function parsePackJson(text){
  const data = JSON.parse(text);
  const files = (Array.isArray(data?.stickers) ? data.stickers : [])
    .filter(f => f && typeof f.b64 === 'string' && f.b64)
    .map(f => ({ name: String(f.name || 'sticker'), type: f.type, data: new Uint8Array(bufFromB64(f.b64)) }));
  if(!files.length) throw new Error(t('stickers.archiveEmpty'));
  return { name: String(data.name || t('stickers.defaultPackName')), files };
}

const mimeOf = (f) => (typeof f.type === 'string' && f.type.startsWith('image/')) ? f.type : stickerMimeOf(f.name);

async function isNameTaken(name){
  const packs = await listPacks();
  return packs.some(p => p.name === name);
}

function cardHtml(parsed, previewUrl, alreadyAdded){
  const btnLabel = alreadyAdded ? t('stickers.already') : t('stickers.add');
  return html`<div class="sticker-pack-preview">
    <img src="${previewUrl}" alt="" draggable="false">
    <button type="button" class="${cx('sticker-pack-add-btn', alreadyAdded && 'added')}"${raw(alreadyAdded ? ' disabled' : '')}>${btnLabel}</button>
  </div>
  <div class="sticker-pack-meta">
    <span class="sticker-pack-name">${parsed.name}</span>
    <span class="sticker-pack-count">${t('stickers.countSuffix', { count: parsed.files.length })}</span>
  </div>`;
}

async function addParsedPack(parsed, btn){
  btn.disabled = true;
  btn.textContent = t('stickers.adding');
  // Повторная проверка перед созданием: пак мог появиться после отрисовки карточки.
  if(await isNameTaken(parsed.name)){
    btn.textContent = t('stickers.already');
    btn.classList.add('added');
    return;
  }
  const pack = await createPack(parsed.name);
  for(const f of parsed.files){
    const file = new File([f.data], f.name, { type: mimeOf(f) });
    await addSticker(pack.id, file);
  }
  btn.textContent = t('stickers.added');
  btn.classList.add('added');
}

export async function loadStickerPackCard(host, url, senderJid){
  const bubble = host.closest('.bubble');
  try{
    let blob, downloadUrl;
    if(isAesgcm(url)){
      const entry = await media.decrypt(url, null, senderJid);
      if(entry.status === 'error') throw entry.error || new Error(t('stickers.decryptPackFailed'));
      blob = await (await fetch(entry.blobUrl)).blob();
      downloadUrl = entry.blobUrl;
    } else {
      const resp = await fetch(url);
      if(!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + t('stickers.loadingPackSuffix'));
      blob = await resp.blob();
      downloadUrl = url;
    }
    if(bubble){ bubble.dataset.downloadUrl = downloadUrl; bubble.dataset.downloadName = 'stickers.json'; }

    const parsed = parsePackJson(await blob.text());
    const previewEntry = parsed.files[0];
    const previewUrl = URL.createObjectURL(new Blob([previewEntry.data], { type: mimeOf(previewEntry) }));
    const alreadyAdded = await isNameTaken(parsed.name);

    if(!host.isConnected){ URL.revokeObjectURL(previewUrl); return; } // список перерисован
    setHTML(host, cardHtml(parsed, previewUrl, alreadyAdded));

    const btn = host.querySelector('.sticker-pack-add-btn');
    if(btn && !alreadyAdded){
      btn.addEventListener('click', async () => {
        try{ await addParsedPack(parsed, btn); }
        catch(e){
          toast(e?.message || t('stickers.addFailed'));
          btn.disabled = false;
          btn.textContent = t('stickers.add');
        }
      });
    }
  }catch{
    if(!host.isConnected) return;
    setHTML(host, html`<span class="sticker-pack-error">${t('stickers.loadFailed')}</span>`);
  }
}
