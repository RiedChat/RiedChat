// ===================== ui/security-warnings.js =====================
// Накопленные крипто-предупреждения по контакту при открытии чата: смена identity-ключа (identity-store.js:listPendingIdentityChanges) и новое OMEMO-устройство (listPendingDeviceChanges). Раньше логи писались, но до UI не доходили.
import { omemo } from '../crypto/omemo/state.js';
import { t } from '../i18n/t.js';

import { confirmChoice } from './confirm-modal.js';
import { openFingerprintModal } from './fingerprint-modal.js';

// Общая схема трёх предупреждений: confirm, затем (опционально) подтверждение прочтения, затем - при основной кнопке - модалка отпечатков.
async function warn({ title, desc, ok = t('security.checkFingerprint'), cancel = t('security.gotIt'), ack }){
  const openFp = await confirmChoice(title, desc, ok, cancel);
  if(ack) await ack();
  if(openFp) await openFingerprintModal();
}

const idsOf = list => list.map(e => e.deviceId).join(', ');

// Вызывается из app.js openChat(jid) после отрисовки чата.
export async function checkSecurityWarnings(bareJid){
  if(!omemo.ready || !omemo.store) return;
  const store = omemo.store;
  // identifier identity-лога - libsignal-адрес "bareJid.deviceId": фильтруем по префиксу "<bareJid>." (а не по SignalProtocolAddress).
  const prefix = bareJid + '.';

  // Шаги строго по порядку: загрузить список, и если не пуст - показать предупреждение.
  const steps = [
    // ---- смена identity-ключа устройства(-в) контакта ----
    {
      load: async () => (await store.listPendingIdentityChanges()).filter(e => e.identifier.startsWith(prefix)),
      title: t('security.identityChangedTitle'),
      desc: () => t('security.identityChangedDesc'),
      ack: async list => { for(const e of list) await store.acknowledgeIdentityChange(e.identifier); },
    },
    // ---- новое устройство у контакта ----
    {
      load: () => store.listPendingDeviceChanges(bareJid),
      title: t('security.newDeviceTitle'),
      desc: list => t('security.newDeviceDesc', { ids: idsOf(list) }),
      ack: async list => { for(const e of list) await store.acknowledgeDeviceChange(e.bareJid, e.deviceId); },
    },
    // ---- новое устройство ждёт места (лимит запоминаемых ключей исчерпан) ----
    // Отличие от шага выше: устройство не принято и не будет, пока пользователь не заменит или не удалит запомненный ключ (crypto/identity-store.js:isTrustedIdentity/pendingSlotKey). Без предупреждения о проблеме можно было узнать только из невнятного текста в чате.
    {
      load: () => omemo.pendingSlotDevices(bareJid),
      title: t('security.pendingDeviceTitle'),
      desc: list => t('security.pendingDeviceDesc', { ids: idsOf(list) }),
      ok: t('security.openOmemoMenu'),
      cancel: t('security.later'),
    },
  ];

  for(const step of steps){
    const list = await step.load();
    if(!list.length) continue;
    await warn({
      title: step.title,
      desc: step.desc(list),
      ok: step.ok,
      cancel: step.cancel,
      ack: step.ack && (() => step.ack(list)),
    });
  }
}
