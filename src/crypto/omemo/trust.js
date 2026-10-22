// ===================== crypto/omemo/trust.js =====================
// Доверие/отпечатки ключей (свой и контактов), отметка "проверен".
import * as B from '../bytes.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- доверие / отпечатки ----------
  hexFingerprint(buf){
    return B.bytesToHex(buf).match(/.{1,8}/g).join(' ');
  },
  myFingerprint(){
    if(!this.ready) return null;
    return this.hexFingerprint(this.identityKeyPair.pubKey);
  },
  // raw - сохранённый base64 identity key (или null, если ключа нет).
  async _fingerprintEntry(addr, deviceId, raw){
    const verified = raw ? await this.store.isVerified(addr) : false;
    return { deviceId, fingerprint: raw ? this.hexFingerprint(B.bufFromB64(raw)) : null, verified, addr };
  },
  async contactFingerprints(bareJid){
    const ids = await this.getDeviceList(bareJid);
    const out = [];
    for(const id of ids){
      const addr = new libsignal.SignalProtocolAddress(bareJid, id).toString();
      // Устройство с недавно сменившимся ключом скрываем, пока не установится НОВАЯ сессия
      // (identity-store.js: isPendingReverify/clearPendingReverify) - иначе пользователь отметит
      // проверенным ключ, который libsignal тут же перезапишет.
      if(await this.store.isPendingReverify(addr)) continue;
      let raw = await this.store.getIdentityRaw(addr);
      if(!raw){
        // сессии нет - берём identity key из bundle
        try{ const b = await this._fetchBundle(bareJid, id); raw = B.b64FromBuf(b.identityKey); }catch{ /* пропустим */ }
      }
      out.push(await this._fingerprintEntry(addr, id, raw));
    }
    return out;
  },
  // "Мёртвые" identity: ключ запомнен (в т.ч. проверенный), но устройства нет в текущем device-list контакта
  // (напр. переустановка клиента с новым device-id; retract на старый id контакт не публикует).
  // Это не смена ключа того же устройства (isPendingReverify), а новое устройство + осиротевшее старое.
  async orphanedFingerprints(bareJid){
    const currentIds = new Set((await this.getDeviceList(bareJid)).map(String));
    const prefix = bareJid + '.';
    const identifiers = await this.store.listKnownIdentities(prefix);
    const out = [];
    for(const addr of identifiers){
      const deviceId = addr.slice(prefix.length);
      if(currentIds.has(deviceId)) continue; // всё ещё актуальное устройство - не осиротевшее
      const raw = await this.store.getIdentityRaw(addr);
      out.push(await this._fingerprintEntry(addr, deviceId, raw));
    }
    return out;
  },
  // Ручное "забыть устройство": для осиротевших identity (orphanedFingerprints) и недоверия конкретному устройству.
  // Чистит identity+verified+pendingReverify и сессию - при новом сообщении с этого device-id TOFU пройдёт заново.
  async forgetDevice(addr){
    await this.store.deleteIdentity(addr);
    await this.store.removeSession(addr);
    // Одного удаления ключа мало: id остаётся в deviceListCache/learnedDevices/PEP-списке контакта, окно показывает
    // устройство снова, а encryptFor() заново строит сессию и занимает слот. Поэтому id ещё и игнорируем,
    // пока устройство само не пришлёт сообщение (_learnIncomingDevice снимает игнор).
    const { bare, id } = this._splitAddr(addr);
    await this.store._set('ignoredDevice', addr, true);
    (this.ignoredDevices[bare] = this.ignoredDevices[bare] || new Set()).add(id);
    this.learnedDevices[bare]?.ids.delete(id);
    const cached = this.deviceListCache[bare];
    if(cached) cached.ids = cached.ids.filter(x => x !== id);
  },
  _splitAddr(addr){
    const i = addr.lastIndexOf('.');
    return { bare: addr.slice(0, i), id: parseInt(addr.slice(i + 1), 10) };
  },
  async _loadIgnoredDevices(){
    this.ignoredDevices = {};
    const prefix = this.store._k('ignoredDevice');
    for(const k of await this.store.idb.keys(prefix)){
      const { bare, id } = this._splitAddr(k.slice(prefix.length));
      (this.ignoredDevices[bare] = this.ignoredDevices[bare] || new Set()).add(id);
    }
  },

  // ---------- устройства сверх лимита на контакта ----------
  // Лимит - omemo.store.getMaxDevicesPerContact/setMaxDevicesPerContact.
  // Устройства, чей ключ пришёл при занятых слотах (identity-store.js:isTrustedIdentity), ждут решения пользователя:
  // заменить существующее или освободить слот.
  async pendingSlotDevices(bareJid){
    const entries = await this.store.listPendingSlotDevices(bareJid);
    return entries.map(e => ({
      deviceId: e.identifier.slice((e.bareJid + '.').length),
      fingerprint: this.hexFingerprint(B.bufFromB64(e.b64)),
      addr: e.identifier,
      ts: e.ts,
    }));
  },
  // Принимает новое устройство на место evictAddr (если указан): старый ключ/сессия забываются (как forgetDevice),
  // затем ключ из очереди становится доверенным. Без evictAddr сработает, только если слот уже свободен.
  async acceptPendingDevice(newAddr, evictAddr){
    if(evictAddr) await this.forgetDevice(evictAddr);
    return this.store.resolvePendingSlot(newAddr);
  },
});
