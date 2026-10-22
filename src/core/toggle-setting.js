// ===================== core/toggle-setting.js =====================
// Чекбокс-настройка модалки профиля в localStorage; контракт load/openInModal/commit для features/profile/modal.js.
//   perAccount - ключ привязан к аккаунту (accountKey), иначе общий на устройство;
//   invert     - чекбокс показывает обратное значение.
import { $ } from './dom-utils.js';
import { accountKey, lsGet, lsSet } from './storage.js';

export function toggleSetting(lsKey, defaultValue, toggleId, { perAccount = false, invert = false } = {}){
  const key = () => perAccount ? accountKey(lsKey) : lsKey;
  const load = () => lsGet(key(), defaultValue);
  return {
    load,
    openInModal(){ $(toggleId).checked = !!load() !== invert; },
    commit(){ lsSet(key(), $(toggleId).checked !== invert); },
  };
}
