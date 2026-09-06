// ===================== features/stickers/pack-card.js =====================
// Догрузка карточки "пак стикеров" в сообщении (плейсхолдер рисует
// ui/chat-view/bubble-renderers.js:renderStickerPackBubble, вызывается из
// ui/chat-view/render-messages.js так же, как loadEncryptedMedia/
// loadPlainImage для остальных типов вложений).
//
// Шаги: скачать/расшифровать присланный zip (features/stickers/share.js) →
// разобрать его (core/zip.js) → показать превью первого стикера + название
// пака (берём из первого сегмента пути в архиве) + кнопку "Добавить".
// Добавление - обычная сборка нового пака в локальной коллекции
// (storage.js), но с защитой от дублей: если пак с таким названием уже
// есть, кнопка недоступна ещё до клика (см. isNameTaken).
import { html, raw, setHTML } from '../../core/safe-html.js';
import { toast } from '../../core/dom-utils.js';
import { media } from '../../net/media.js';
import { readZip } from '../../core/zip.js';
import { listPacks, createPack, addSticker } from './storage.js';
import { t } from '../../i18n/t.js';

const MIME_BY_EXT = { png:'image/png', webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg', heic:'image/heic', heif:'image/heic', gif:'image/gif' };
function extOf(name){ const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function mimeOf(name){ return MIME_BY_EXT[extOf(name)] || 'application/octet-stream'; }

// entry.name вида "Название пака/003-cat.png" (см. share.js:buildStickerPackFile) -
// имя пака берём из первого сегмента пути первого файла; всё, что лежит вне
// этой папки (архив собран не нашим клиентом), просто игнорируем.
function parsePackZip(entries){
  const withFolder = entries.filter(e => e.name.includes('/') && e.name.split('/')[1]);
  if(!withFolder.length) throw new Error(t('stickers.archiveEmpty'));
  const folder = withFolder[0].name.split('/')[0];
  const files = withFolder.filter(e => e.name.split('/')[0] === folder);
  if(!files.length) throw new Error(t('stickers.archiveEmpty'));
  return { name: folder, files };
}

async function isNameTaken(name){
  const packs = await listPacks();
  return packs.some(p => p.name === name);
}

function cardHtml(parsed, previewUrl, alreadyAdded){
  const btnLabel = alreadyAdded ? t('stickers.already') : t('stickers.add');
  return String(html`<div class="sticker-pack-preview">
    <img src="${previewUrl}" alt="" draggable="false">
    <button type="button" class="sticker-pack-add-btn${raw(alreadyAdded ? ' added' : '')}"${raw(alreadyAdded ? ' disabled' : '')}>${btnLabel}</button>
  </div>
  <div class="sticker-pack-meta">
    <span class="sticker-pack-name">${parsed.name}</span>
    <span class="sticker-pack-count">${t('stickers.countSuffix', { count: parsed.files.length })}</span>
  </div>`);
}

async function addParsedPack(parsed, btn){
  btn.disabled = true;
  btn.textContent = t('stickers.adding');
  // Повторная проверка ПРЯМО перед созданием - карточка могла провисеть в
  // чате долго, и пак с таким названием мог появиться уже после отрисовки
  // (в т.ч. добавлением этого же пака из другого чата за это время).
  if(await isNameTaken(parsed.name)){
    btn.textContent = t('stickers.already');
    btn.classList.add('added');
    return;
  }
  const pack = await createPack(parsed.name);
  for(const f of parsed.files){
    const fileName = f.name.slice(f.name.indexOf('/') + 1);
    const file = new File([f.data], fileName, { type: mimeOf(fileName) });
    await addSticker(pack.id, file);
  }
  btn.textContent = t('stickers.added');
  btn.classList.add('added');
}

export async function loadStickerPackCard(placeholderId, url, senderJid){
  const host = document.getElementById(placeholderId);
  if(!host) return;
  const bubble = host.closest('.bubble');
  try{
    let blob;
    if(media.isAesgcm(url)){
      const entry = await media.decrypt(url, null, senderJid);
      if(entry.status === 'error') throw entry.error || new Error(t('stickers.decryptPackFailed'));
      blob = await (await fetch(entry.blobUrl)).blob();
      if(bubble){ bubble.dataset.downloadUrl = entry.blobUrl; bubble.dataset.downloadName = 'stickers.zip'; }
    } else {
      const resp = await fetch(url);
      if(!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + t('stickers.loadingPackSuffix'));
      blob = await resp.blob();
      if(bubble){ bubble.dataset.downloadUrl = url; bubble.dataset.downloadName = 'stickers.zip'; }
    }

    const entries = await readZip(blob);
    const parsed = parsePackZip(entries);
    const previewEntry = parsed.files[0];
    const previewUrl = URL.createObjectURL(new Blob([previewEntry.data], { type: mimeOf(previewEntry.name) }));
    const alreadyAdded = await isNameTaken(parsed.name);

    if(!document.getElementById(placeholderId)){ URL.revokeObjectURL(previewUrl); return; } // список уже перерисован
    setHTML(host, raw(cardHtml(parsed, previewUrl, alreadyAdded)));

    const btn = host.querySelector('.sticker-pack-add-btn');
    if(btn && !alreadyAdded){
      btn.addEventListener('click', async () => {
        try{ await addParsedPack(parsed, btn); }
        catch(e){
          toast((e && e.message) || t('stickers.addFailed'));
          btn.disabled = false;
          btn.textContent = t('stickers.add');
        }
      });
    }
  }catch(e){
    if(!document.getElementById(placeholderId)) return;
    setHTML(host, html`<span class="sticker-pack-error">${t('stickers.loadFailed')}</span>`);
  }
}
