// ============= crypto/identity-store/core.js =============
// Ключевая пара identity, deviceId/registrationId, TOFU-доверие
// (isTrustedIdentity/saveIdentity), verified-флаг и список известных identity.
import { bytes as B } from '../bytes.js';
import { debugLog } from '../../core/debug-log.js';

export const core = {
  async getIdentityKeyPair(){
    const v = await this.idb.get(this.ns + 'identityKey');
    return v ? B.unpackKeyPair(v) : undefined;
  },
  async setIdentityKeyPair(kp){
    await this.idb.set(this.ns + 'identityKey', B.packKeyPair(kp));
  },
  async getLocalRegistrationId(){
    return await this.idb.get(this.ns + 'registrationId');
  },
  async setLocalRegistrationId(id){
    await this.idb.set(this.ns + 'registrationId', id);
  },
  async getDeviceId(){
    return await this.idb.get(this.ns + 'deviceId');
  },
  async setDeviceId(id){
    await this.idb.set(this.ns + 'deviceId', id);
  },

  async isTrustedIdentity(identifier, identityKey /*, direction */){
    const key = this.ns + 'trustedIdentity:' + identifier;
    const known = await this.idb.get(key);
    const b64 = B.b64FromBuf(identityKey);
    if(!known){
      // Лимит "запоминаемых" устройств на контакта (см. getMaxDevicesPerContact/
      // setMaxDevicesPerContact - настраивается пользователем, 1..5, по
      // умолчанию 5). identifier здесь - 'bareJid.deviceId'; если для этого
      // bareJid уже занято максимум слотов, новое устройство сразу не
      // принимаем - кладём его ключ в очередь (pendingSlotKey) и просим
      // пользователя в UI (см. ui/fingerprint-modal.js) либо заменить один
      // из существующих ключей, либо просто удалить один, и уже тогда
      // resolvePendingSlot довносит этот ключ как доверенный.
      const bareJid = identifier.slice(0, identifier.lastIndexOf('.'));
      const limit = await this.getMaxDevicesPerContact();
      const current = await this.countTrustedDevices(bareJid);
      if(current >= limit){
        await this.idb.set(this.ns + 'pendingSlotKey:' + identifier, { bareJid, b64, ts: Date.now() });
        debugLog('identity NEW для ' + identifier + ': лимит устройств (' + limit + ') исчерпан, ключ ждёт решения пользователя (pendingSlotKey)');
        return false;
      }
      // TOFU: доверяем при первом использовании и запоминаем.
      await this.idb.set(key, b64);
      await this.idb.set(this.ns + 'identityVerified:' + identifier, false);
      // Если раньше (при исчерпанном лимите) для этого же identifier уже
      // была отложена запись pendingSlotKey, а слот с тех пор освободился
      // без явного "заменить"/"отклонить" в UI (например, пользователь
      // забыл другое устройство отдельно) - сейчас устройство приняли по
      // обычному TOFU-пути в обход pendingSlotKey. Без этой чистки запись
      // осталась бы в базе навсегда и модалка продолжала бы показывать уже
      // доверенное устройство ещё и как "ждёт места".
      await this.idb.del(this.ns + 'pendingSlotKey:' + identifier);
      return true;
    }
    if(known !== b64){
      // Ключ собеседника сменился (переустановка клиента, сброс хранилища,
      // либо в худшем случае MITM). Раньше здесь возвращалось false, и
      // libsignal бросал "Identity key changed"/"Unknown identity key" -
      // после чего переписка с этим устройством ломалась НАВСЕГДА, потому
      // что перезаписать identity было некому (нет UI для этого).
      //
      // Гибридная стратегия: автоматически принимаем новый ключ (иначе
      // клиент неюзабелен после любой переустановки у собеседника), сбрасываем
      // verified и ЗАПОМИНАЕМ сам факт смены в отдельный лог - чтобы позже
      // UI могла показать пользователю предупреждение вида "ключ контакта
      // изменился" и дать явно сверить отпечаток. Это НЕ настоящая защита
      // от активного MITM (тот и раньше работал только через ручную сверку
      // отпечатков), но и не хуже - просто явное решение вместо тихого отказа.
      await this.idb.set(key, b64);
      await this.idb.set(this.ns + 'identityVerified:' + identifier, false);
      // БАГ (исправлено): isTrustedIdentity дёргается libsignal'ом на КАЖДОЕ
      // сообщение (не только при установлении сессии, см. decryptWhisperMessage/
      // encrypt в libsignal-protocol.js) - если бы мы продолжали логировать
      // identityChangeLog при каждом вызове, пока устройство "в подвешенном"
      // состоянии, предупреждение всплывало бы заново при каждом открытии чата,
      // а отметка "проверен" немедленно затиралась бы следующим же сообщением.
      // Вместо этого помечаем устройство как "ждёт переверификации" ОДИН раз -
      // дальнейшие вызовы для того же identifier эту пометку не трогают, пока
      // её явно не снимет свежее установление сессии (см.
      // clearPendingReverify в decrypt.js/session-builder.js - момент, когда
      // устройство буквально "запросилось само" заново).
      const alreadyPending = await this.isPendingReverify(identifier);
      if(!alreadyPending){
        await this.idb.set(this.ns + 'pendingReverify:' + identifier, true);
        await this._flagIdentityChange(identifier, known, b64);
      }
      debugLog('identity CHANGED для ' + identifier + ': автопринятие нового ключа, verified сброшен, устройство скрыто из списка отпечатков до новой сессии');
      return true;
    }
    return true;
  },

  async saveIdentity(identifier, identityKey){
    const key = this.ns + 'trustedIdentity:' + identifier;
    const b64 = B.b64FromBuf(identityKey);
    const existing = await this.idb.get(key);
    const changed = existing && existing !== b64;
    await this.idb.set(key, b64);
    if(changed){
      await this.idb.set(this.ns + 'identityVerified:' + identifier, false);
    }
    return changed; // true если ключ контакта сменился (возможен MITM либо переустановка клиента)
  },
  async getIdentityRaw(identifier){
    return await this.idb.get(this.ns + 'trustedIdentity:' + identifier);
  },
  async setVerified(identifier, verified){
    await this.idb.set(this.ns + 'identityVerified:' + identifier, !!verified);
  },
  async isVerified(identifier){
    return !!(await this.idb.get(this.ns + 'identityVerified:' + identifier));
  },
  async listKnownIdentities(prefix){
    const keys = await this.idb.keys(this.ns + 'trustedIdentity:');
    return keys.map(k => k.slice((this.ns + 'trustedIdentity:').length))
      .filter(id => !prefix || id.startsWith(prefix));
  },
  // Полностью забывает identity конкретного устройства: сам доверенный ключ,
  // отметку verified и pendingReverify. Для ручной очистки "мёртвых" устройств -
  // тех, что контакт больше не публикует в своём device-list (переустановка
  // клиента с новым device-id, а не просто сменой ключа у старого - см.
  // crypto/omemo/trust.js:orphanedFingerprints), но которые продолжают висеть
  // в хранилище, раз их никто явно не удалял. Сессию (crypto/session-store.js)
  // этот метод не трогает - её чистит вызывающий код (omemo.forgetDevice),
  // т.к. она лежит в другом модуле хранилища.
  async deleteIdentity(identifier){
    await this.idb.del(this.ns + 'trustedIdentity:' + identifier);
    await this.idb.del(this.ns + 'identityVerified:' + identifier);
    await this.idb.del(this.ns + 'pendingReverify:' + identifier);
  },
};
