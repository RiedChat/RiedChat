// ===================== features/profile/modal.js =====================
// Модалка "Мой профиль": псевдоним + аватар, видимые контактам вместо JID (XMPP-логика - net/vcard.js).
// Обои и настройки видео - в той же модалке, но в features/wallpaper/modal.js и features/autoload-settings.js.
import { errMsg } from '../../core/debug-log.js';
import { $, toast, wireModalDismiss } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { profileStore } from '../../net/vcard-storage.js';
import { applyProfile } from '../../net/vcard.js';
import { autoload } from '../autoload-settings.js';
import { swipeToggles } from '../swipe-settings.js';
import * as themeSettings from '../theme-settings.js';
import * as wallpaperModal from '../wallpaper/modal.js';

import {
  renderAvatarButton,
  renderPreview,
  resetPending,
  resolvePendingPhoto,
  wireAvatarPicker,
} from './avatar.js';

// Секции модалки с контрактом openInModal/commit.
const sections = [wallpaperModal, ...Object.values(autoload), ...swipeToggles];

function openProfileModal(){
  const profile = profileStore.get();
  resetPending();
  $('profile-nickname').value = profile?.nickname || '';
  renderPreview(profile?.photoB64, profile?.photoType);

  sections.forEach(s => s.openInModal());
  themeSettings.openInModal();

  $('profile-modal').showModal();
}

export function wireProfile(){
  renderAvatarButton(); // профиль мог быть сохранён в прошлой сессии

  const closeProfileModal = wireModalDismiss('profile-modal', 'profile-modal-close');

  $('my-avatar-btn').addEventListener('click', openProfileModal);

  wireAvatarPicker();
  wallpaperModal.wireModal();

  $('profile-save').addEventListener('click', async () => {
    const nickname = $('profile-nickname').value.trim().slice(0, 60);
    const current = profileStore.get() || {};
    const { photoB64, photoType } = resolvePendingPhoto(current);

    const profile = {nickname, photoB64, photoType, photoHash: current.photoHash || ''};
    profileStore.set(profile);
    renderAvatarButton();

    sections.forEach(s => s.commit());

    closeProfileModal();
    toast(t('profile.saved'));

    if(!state.connection?.connected){
      toast(t('profile.offlineNotice'));
      return;
    }
    try{
      await applyProfile(profile);
      toast(t('profile.broadcasted'));
    }catch(err){
      toast(t('profile.broadcastError', { error: errMsg(err) }));
    }
  });
}
