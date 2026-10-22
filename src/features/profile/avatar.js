// ===================== features/profile/avatar.js =====================
// Кнопка своего аватара, превью в модалке и незакоммиченный выбор/удаление фото (сохранение - features/profile/modal.js).
import { $, initials } from '../../core/dom-utils.js';
import { resizeImageToJpegDataUrl, dataUrlOf } from '../../core/image-utils.js';
import { createPendingImage, wirePendingImagePicker } from '../../core/pending-image.js';
import { html, setHTML } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { profileStore } from '../../net/vcard-storage.js';

// Несохранённые изменения аватара; сбрасываются при каждом открытии модалки.
const pending = createPendingImage({ previewFn: (b64, type) => renderPreview(b64, type) });

// Содержимое аватарки: картинка или инициалы (кнопка в шапке и превью в модалке).
function avatarHtml(photoB64, photoType){
  return photoB64
    ? html`<img src="${dataUrlOf(photoB64, photoType)}" alt="">`
    : html`${initials(state.myBareJid || state.myJid || '?')}`;
}

export function renderAvatarButton(){
  const profile = profileStore.get();
  const btn = $('my-avatar-btn');
  if(!btn) return;
  setHTML(btn, avatarHtml(profile?.photoB64, profile?.photoType));
}

export function renderPreview(photoB64, photoType){
  setHTML($('profile-avatar-preview'), avatarHtml(photoB64, photoType));
  $('profile-avatar-remove').hidden = !photoB64;
}

// Сбрасывает несохранённый выбор при открытии модалки.
export function resetPending(){ pending.reset(); }

// Итоговые photoB64/photoType с учётом несохранённого выбора/удаления.
export function resolvePendingPhoto(profile){
  const current = profile?.photoB64 ? { b64: profile.photoB64, type: profile.photoType } : null;
  const photo = pending.resolve(current);
  return { photoB64: photo ? photo.b64 : null, photoType: photo ? photo.type : null };
}

// Вешает обработчики выбора/удаления фото; "Сохранить" обрабатывает modal.js (resolvePendingPhoto).
export function wireAvatarPicker(){
  wirePendingImagePicker({
    pickId: 'profile-avatar-pick',
    inputId: 'profile-avatar-input',
    removeId: 'profile-avatar-remove',
    pending,
    needImageKey: 'profile.needImageFile',
    errorKey: 'profile.imageProcessError',
    // 160px по большей стороне, JPEG q=0.85: хватает для аватарки (макс. 64px), vCard остаётся компактной.
    process: async (file) => [await resizeImageToJpegDataUrl(file, 160, 0.85), 'image/jpeg'],
  });
}
