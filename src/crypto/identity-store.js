// ===================== crypto/identity-store.js =====================
// Identity-ключи собеседников: TOFU, verified-флаг, лимит устройств, логи смены ключей/новых устройств.
import { debugLog } from '../core/debug-log.js';

import * as B from './bytes.js';

// Лимит запоминаемых устройств на контакта: 1..5, по умолчанию 5.
const clampMaxDevices = (n) => Math.max(1, Math.min(5, Number(n) || 5));

export const identityMethods = {
  // ---- identity-пара, deviceId/registrationId, TOFU (isTrustedIdentity/saveIdentity), verified-флаг ----
  // Запоминает ключ устройства как доверенный и сбрасывает его verified-флаг.
  async _trust(identifier, b64){
    await Promise.all([
      this._set('trustedIdentity', identifier, b64),
      this._set('identityVerified', identifier, false),
    ]);
  },

  // Собственные значения под ns + name (без kind/id: формат ключей не менять - иначе потеряем уже сохранённое).
  _own(name){
    return { get: () => this.idb.get(this.ns + name), set: (v) => this.idb.set(this.ns + name, v) };
  },
  async getIdentityKeyPair(){
    const v = await this._own('identityKey').get();
    return v ? B.unpackKeyPair(v) : undefined;
  },
  setIdentityKeyPair(kp){ return this._own('identityKey').set(B.packKeyPair(kp)); },
  getLocalRegistrationId(){ return this._own('registrationId').get(); },
  setLocalRegistrationId(id){ return this._own('registrationId').set(id); },
  getDeviceId(){ return this._own('deviceId').get(); },
  setDeviceId(id){ return this._own('deviceId').set(id); },

  async isTrustedIdentity(identifier, identityKey /*, direction */){
    const known = await this._get('trustedIdentity', identifier);
    const b64 = B.b64FromBuf(identityKey);
    if(!known){
      // identifier - 'bareJid.deviceId'
      const bareJid = identifier.slice(0, identifier.lastIndexOf('.'));
      const limit = await this.getMaxDevicesPerContact();
      const current = await this.countTrustedDevices(bareJid);
      if(current >= limit){
        // лимит слотов исчерпан -> ключ в очередь pendingSlotKey, решает пользователь (fingerprint-modal)
        await this._set('pendingSlotKey', identifier, { bareJid, b64, ts: Date.now() });
        debugLog('identity NEW для ' + identifier + ': лимит устройств (' + limit + ') исчерпан, ключ ждёт решения пользователя (pendingSlotKey)');
        return false;
      }
      // TOFU: доверяем при первом использовании; чистим устаревший pendingSlotKey этого identifier
      await this._trust(identifier, b64);
      await this._del('pendingSlotKey', identifier);
      return true;
    }
    if(known !== b64){
      // ключ сменился -> принимаем, сбрасываем verified, один раз помечаем pendingReverify
      // (isTrustedIdentity вызывается на каждое сообщение, повторный лог затирал бы отметку "проверен")
      await this._trust(identifier, b64);
      if(!(await this.isPendingReverify(identifier))){
        await this.setPendingReverify(identifier, true);
        await this._flagIdentityChange(identifier, known, b64);
      }
      debugLog('identity CHANGED для ' + identifier + ': автопринятие нового ключа, verified сброшен, устройство скрыто из списка отпечатков до новой сессии');
    }
    return true;
  },

  async saveIdentity(identifier, identityKey){
    const b64 = B.b64FromBuf(identityKey);
    const existing = await this._get('trustedIdentity', identifier);
    const changed = !!existing && existing !== b64;
    await (changed ? this._trust(identifier, b64) : this._set('trustedIdentity', identifier, b64));
    return changed;
  },
  getIdentityRaw(identifier){ return this._get('trustedIdentity', identifier); },
  setVerified(identifier, verified){ return this._set('identityVerified', identifier, !!verified); },
  async isVerified(identifier){ return !!(await this._get('identityVerified', identifier)); },
  async listKnownIdentities(prefix){
    const trustedPrefix = this._k('trustedIdentity');
    const keys = await this.idb.keys(trustedPrefix);
    return keys.map(k => k.slice(trustedPrefix.length))
      .filter(id => !prefix || id.startsWith(prefix));
  },
  // Забывает identity устройства: доверенный ключ, verified и pendingReverify. Для ручной очистки "мёртвых" устройств
  // (нет в device-list контакта, см. omemo/trust.js:orphanedFingerprints). Сессию (session-store.js) не трогает -
  // её чистит вызывающий код (omemo.forgetDevice).
  deleteIdentity(identifier){
    return Promise.all(['trustedIdentity', 'identityVerified', 'pendingReverify']
      .map(kind => this._del(kind, identifier)));
  },
  // ---- пометка "ждёт переверификации": устройство скрыто из списка отпечатков до новой Signal-сессии ----
  setPendingReverify(identifier, pending){ return this._set('pendingReverify', identifier, !!pending); },
  async isPendingReverify(identifier){ return !!(await this._get('pendingReverify', identifier)); },
  // Снимает пометку при установке НОВОЙ Signal-сессии для identifier (omemo/decrypt.js - входящая,
  // omemo/session-builder.js:_ensureSession - исходящая); устройство возвращается в список отпечатков
  // (omemo/trust.js:contactFingerprints) и его можно отметить проверенным.
  clearPendingReverify(identifier){ return this.setPendingReverify(identifier, false); },
  // ---- шаблон логов с флагом acknowledged (смена ключей, новые устройства) ----
  async _flagLog(kind, id, entry){
    await this._set(kind, id, { ...entry, ts: Date.now(), acknowledged: false });
  },
  // Неподтверждённые записи под prefix: [{ key, entry }].
  async _listPendingLog(kind){
    return (await this.idb.entries(this._k(kind)))
      .filter(([, entry]) => entry && !entry.acknowledged)
      .map(([key, entry]) => ({ key, entry }));
  },
  async _acknowledge(kind, id){
    const entry = await this._get(kind, id);
    if(entry) await this._set(kind, id, { ...entry, acknowledged: true });
  },
  // ---- лог смены identity-ключей контактов (UI-предупреждение "ключ контакта изменился") ----
  async _flagIdentityChange(identifier, oldB64, newB64){
    await this._flagLog('identityChangeLog', identifier, { oldKey: oldB64, newKey: newB64 });
  },
  // Не подтверждённые пользователем смены ключей.
  async listPendingIdentityChanges(){
    const prefix = this._k('identityChangeLog');
    return (await this._listPendingLog('identityChangeLog'))
      .map(({ key, entry }) => ({ identifier: key.slice(prefix.length), ...entry }));
  },
  // Помечает смену показанной (больше не всплывает).
  acknowledgeIdentityChange(identifier){ return this._acknowledge('identityChangeLog', identifier); },
  // ---- лог новых устройств контакта (отличается от лога смены ключа известного устройства) ----
  async hasAnyKnownDevice(bareJid){
    return (await this.idb.keys(this._k('knownDevice', bareJid + ':'))).length > 0;
  },
  async isKnownDevice(bareJid, deviceId){ return !!(await this._get('knownDevice', bareJid + ':' + deviceId)); },
  markDeviceKnown(bareJid, deviceId){ return this._set('knownDevice', bareJid + ':' + deviceId, true); },
  flagNewDevice(bareJid, deviceId){
    return this._flagLog('deviceChangeLog', bareJid + ':' + deviceId, { bareJid, deviceId });
  },
  // Не подтверждённые пользователем новые устройства, опционально по bareJid.
  async listPendingDeviceChanges(bareJidFilter){
    return (await this._listPendingLog('deviceChangeLog'))
      .map(({ entry }) => entry)
      .filter(entry => !bareJidFilter || entry.bareJid === bareJidFilter);
  },
  acknowledgeDeviceChange(bareJid, deviceId){
    return this._acknowledge('deviceChangeLog', bareJid + ':' + deviceId);
  },
  // ---- лимит запоминаемых устройств на контакта (1..5, по умолчанию 5) и очередь сверх лимита (pendingSlotKey) ----
  async getMaxDevicesPerContact(){
    return clampMaxDevices(await this._get('settings', 'maxDevicesPerContact'));
  },
  async setMaxDevicesPerContact(n){
    const clamped = clampMaxDevices(n);
    await this._set('settings', 'maxDevicesPerContact', clamped);
    return clamped;
  },
  async countTrustedDevices(bareJid){
    return (await this.listKnownIdentities(bareJid + '.')).length;
  },

  async listPendingSlotDevices(bareJidFilter){
    const prefix = this._k('pendingSlotKey');
    const out = [];
    for(const [k, entry] of await this.idb.entries(prefix)){
      if(!entry || (bareJidFilter && entry.bareJid !== bareJidFilter)) continue;
      const identifier = k.slice(prefix.length);
      // Защита от осиротевших записей (см. isTrustedIdentity): если identifier уже доверенный по TOFU,
      // запись pendingSlotKey - мусор; удаляем её, а не только пропускаем.
      if(await this._get('trustedIdentity', identifier)){
        await this._del('pendingSlotKey', identifier);
        continue;
      }
      out.push(Object.assign({ identifier }, entry));
    }
    return out;
  },
  discardPendingSlotDevice(identifier){ return this._del('pendingSlotKey', identifier); },
  // Принимает ключ из очереди как доверенный, освободив слот (старое устройство убирает вызывающий:
  // omemo/trust.js:acceptPendingDevice вызывает deleteIdentity/removeSession для evictIdentifier).
  async resolvePendingSlot(identifier){
    const entry = await this._get('pendingSlotKey', identifier);
    if(!entry) return false;
    await this._trust(identifier, entry.b64);
    await this._del('pendingSlotKey', identifier);
    return true;
  },
};
