// ===================== features/profile/avatar.js =====================
// Кнопка своего аватара, превью в модалке профиля и незакоммиченный выбор
// нового фото/удаления (см. features/profile/modal.js - там сохранение).
import { $, initials, toast } from '../../core/dom-utils.js';
import { resizeImageToJpegDataUrl } from '../../core/image-utils.js';
import { html, setHTML } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { loadProfile } from '../../net/vcard-storage.js';
import { t } from '../../i18n/t.js';

const S = state;

// Несохранённые изменения аватара текущего открытого редактирования -
// сбрасываются каждый раз при открытии модалки, чтобы не протащить
// выбор/удаление из отменённой предыдущей попытки.
let pendingPhoto = null;   // {b64, type} - новое выбранное фото, ждёт "Сохранить"
let pendingRemove = false; // true - пользователь нажал "Удалить фото"

export function renderAvatarButton(){
  const profile = loadProfile();
  const btn = $('my-avatar-btn');
  if(!btn) return;
  setHTML(btn, (profile && profile.photoB64)
    ? html`<img src="data:${profile.photoType || 'image/jpeg'};base64,${profile.photoB64}" alt="">`
    : html`${initials(S.myBareJid || S.myJid || '?')}`);
}

export const refreshMyAvatarButton = renderAvatarButton;

export function renderPreview(photoB64, photoType){
  const el = $('profile-avatar-preview');
  if(photoB64){
    setHTML(el, html`<img src="data:${photoType || 'image/jpeg'};base64,${photoB64}" alt="">`);
    $('profile-avatar-remove').style.display = '';
  } else {
    setHTML(el, html`${initials(S.myBareJid || S.myJid || '?')}`);
    $('profile-avatar-remove').style.display = 'none';
  }
}

// Сбрасывает несохранённый выбор - вызывается при каждом открытии модалки.
export function resetPending(){
  pendingPhoto = null;
  pendingRemove = false;
}

export function getPendingPhoto(){ return pendingPhoto; }
export function isPendingRemove(){ return pendingRemove; }

// Вешает обработчики выбора/удаления фото. Сам факт клика по "Сохранить"
// обрабатывается в modal.js - там же читает getPendingPhoto/isPendingRemove.
export function wireAvatarPicker(){
  $('profile-avatar-pick').addEventListener('click', () => $('profile-avatar-input').click());
  $('profile-avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // повторный выбор того же файла должен снова сработать
    if(!file) return;
    if(!file.type || !file.type.startsWith('image/')){
      toast(t('profile.needImageFile'));
      return;
    }
    try{
      // 160px по большей стороне и JPEG q=0.85 - с запасом достаточно для
      // круглой аватарки в интерфейсе (макс. 64px), при этом vCard остаётся
      // компактной (обычно несколько килобайт в base64).
      const dataUrl = await resizeImageToJpegDataUrl(file, 160, 0.85);
      const b64 = dataUrl.split(',')[1];
      pendingPhoto = {b64, type: 'image/jpeg'};
      pendingRemove = false;
      renderPreview(b64, 'image/jpeg');
    }catch(err){
      toast(t('profile.imageProcessError', { error: err && err.message ? err.message : err }));
    }
  });
  $('profile-avatar-remove').addEventListener('click', () => {
    pendingPhoto = null;
    pendingRemove = true;
    renderPreview(null, null);
  });
}
