// ===================== ui/security-warnings.js =====================
// Показ накопленных крипто-предупреждений по конкретному контакту при
// открытии чата с ним: смена identity-ключа (identity-store.js:
// listPendingIdentityChanges) и появление у него нового OMEMO-устройства
// (identity-store.js: listPendingDeviceChanges). Раньше оба лога писались,
// но никогда не читались - до UI предупреждение не доходило.
import { omemo } from '../crypto/omemo/state.js';
import { confirm } from './modals.js';
import { openFingerprintModal } from './fingerprint-modal.js';
import { t } from '../i18n/t.js';

// Вызывается из app.js openChat(jid) после того, как чат отрисован.
export async function checkSecurityWarnings(bareJid){
  if(!omemo.ready || !omemo.store) return;

  // ---- смена identity-ключа устройства(-в) контакта ----
  const allIdentityChanges = await omemo.store.listPendingIdentityChanges();
  // identifier у identity-лога - это libsignal-адрес "bareJid.deviceId", поэтому
  // фильтруем по префиксу "<bareJid>." (совпадение по объекту SignalProtocolAddress).
  const prefix = bareJid + '.';
  const identityChanges = allIdentityChanges.filter(e => e.identifier.startsWith(prefix));
  if(identityChanges.length){
    const openFp = await confirm(
      t('security.identityChangedTitle'),
      t('security.identityChangedDesc'),
      { okText: t('security.checkFingerprint'), cancelText: t('security.gotIt'), okDanger: false }
    );
    for(const e of identityChanges) await omemo.store.acknowledgeIdentityChange(e.identifier);
    if(openFp) await openFingerprintModal();
  }

  // ---- новое устройство у контакта ----
  const deviceChanges = await omemo.store.listPendingDeviceChanges(bareJid);
  if(deviceChanges.length){
    const ids = deviceChanges.map(e => e.deviceId).join(', ');
    const openFp = await confirm(
      t('security.newDeviceTitle'),
      t('security.newDeviceDesc', { ids }),
      { okText: t('security.checkFingerprint'), cancelText: t('security.gotIt'), okDanger: false }
    );
    for(const e of deviceChanges) await omemo.store.acknowledgeDeviceChange(e.bareJid, e.deviceId);
    if(openFp) await openFingerprintModal();
  }

  // ---- новое устройство контакта ждёт места (лимит запоминаемых ключей исчерпан) ----
  // Отличается от блока выше: там устройство уже принято (просто новое),
  // здесь - принято НЕ БЫЛО и не будет, пока пользователь явно не заменит
  // или не удалит один из уже запомненных ключей (см.
  // crypto/identity-store.js:isTrustedIdentity/pendingSlotKey). Без этого
  // предупреждения пользователь узнавал о проблеме только по невнятному
  // тексту в чате (если вообще открывал чат в момент прихода сообщения).
  const pendingSlot = await omemo.pendingSlotDevices(bareJid);
  if(pendingSlot.length){
    const ids = pendingSlot.map(p => p.deviceId).join(', ');
    const openFp = await confirm(
      t('security.pendingDeviceTitle'),
      t('security.pendingDeviceDesc', { ids }),
      { okText: t('security.openOmemoMenu'), cancelText: t('security.later'), okDanger: false }
    );
    if(openFp) await openFingerprintModal();
  }
}
