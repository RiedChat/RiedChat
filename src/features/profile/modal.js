// ===================== features/profile/modal.js =====================
// Модалка "Мой профиль": псевдоним + аватар, которые видят контакты вместо
// JID (см. net/vcard.js - там вся XMPP-логика публикации/рассылки).
// Обои чата и настройки видео живут в той же модалке, но вынесены в
// отдельные модули - см. features/wallpaper/modal.js, features/video-settings.js.
import { $, toast, wireModalDismiss } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import * as wallpaperModal from '../wallpaper/modal.js';
import * as videoSettings from '../video-settings.js';
import * as videoNoteSettings from '../video-note-settings.js';
import * as imageSettings from '../image-settings.js';
import * as stickerSettings from '../sticker-settings.js';
import * as swipeSettings from '../swipe-settings.js';
import * as themeSettings from '../theme-settings.js';
import { loadProfile, saveProfile } from '../../net/vcard-storage.js';
import { applyProfile } from '../../net/vcard.js';
import { t } from '../../i18n/t.js';
import {
  renderAvatarButton,
  renderPreview,
  resetPending,
  getPendingPhoto,
  isPendingRemove,
  wireAvatarPicker,
} from './avatar.js';

const S = state;

function openProfileModal(){
  const profile = loadProfile();
  resetPending();
  $('profile-nickname').value = (profile && profile.nickname) || '';
  renderPreview(profile && profile.photoB64, profile && profile.photoType);

  wallpaperModal.openInModal();
  videoSettings.openInModal();
  videoNoteSettings.openInModal();
  imageSettings.openInModal();
  stickerSettings.openInModal();
  swipeSettings.openInModal();
  themeSettings.openInModal();

  $('profile-modal').classList.add('active');
}

export function wireProfile(){
  renderAvatarButton(); // на случай, если профиль уже был сохранён в прошлой сессии

  const closeProfileModal = wireModalDismiss('profile-modal', 'profile-modal-close');

  $('my-avatar-btn').addEventListener('click', openProfileModal);

  wireAvatarPicker();
  wallpaperModal.wireModal();

  $('profile-save').addEventListener('click', async () => {
    const nickname = $('profile-nickname').value.trim().slice(0, 60);
    const current = loadProfile() || {};
    let photoB64 = current.photoB64 || null;
    let photoType = current.photoType || null;
    if(isPendingRemove()){ photoB64 = null; photoType = null; }
    else {
      const pendingPhoto = getPendingPhoto();
      if(pendingPhoto){ photoB64 = pendingPhoto.b64; photoType = pendingPhoto.type; }
    }

    const profile = {nickname, photoB64, photoType, photoHash: current.photoHash || ''};
    saveProfile(profile);
    renderAvatarButton();

    wallpaperModal.commit();
    videoSettings.commit();
    videoNoteSettings.commit();
    imageSettings.commit();
    stickerSettings.commit();
    swipeSettings.commit();
    themeSettings.commit();

    closeProfileModal();
    toast(t('profile.saved'));

    if(!S.connection || !S.connection.connected){
      toast(t('profile.offlineNotice'));
      return;
    }
    try{
      await applyProfile(profile);
      toast(t('profile.broadcasted'));
    }catch(err){
      toast(t('profile.broadcastError', { error: err && err.message ? err.message : err }));
    }
  });
}
