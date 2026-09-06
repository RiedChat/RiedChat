// ===================== crypto/omemo/trust.js =====================
// Доверие / отпечатки ключей (fingerprints) - свой и контактов, отметка "проверен".
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- доверие / отпечатки ----------
  hexFingerprint(buf){
    const bytes = new Uint8Array(buf);
    let hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
    return hex.match(/.{1,8}/g).join(' ');
  },
  async myFingerprint(){
    if(!this.ready) return null;
    return this.hexFingerprint(this.identityKeyPair.pubKey);
  },
  async contactFingerprints(bareJid){
    const ids = await this.getDeviceList(bareJid);
    const out = [];
    for(const id of ids){
      const addr = new libsignal.SignalProtocolAddress(bareJid, id).toString();
      // Устройство, у которого недавно сменился ключ, скрываем из списка,
      // пока с ним не установится НОВАЯ сессия (см. crypto/identity-store.js:
      // isPendingReverify/clearPendingReverify) - иначе пользователь отмечал
      // бы проверенным ключ, который libsignal через мгновение снова
      // перезапишет при следующем сообщении с тем же устройством.
      if(await this.store.isPendingReverify(addr)) continue;
      let raw = await this.store.getIdentityRaw(addr);
      if(!raw){
        // сессии ещё нет - попробуем достать identity key прямо из bundle
        try{ const b = await this._fetchBundle(bareJid, id); raw = B.b64FromBuf(b.identityKey); }catch(e){ /* пропустим */ }
      }
      const verified = raw ? await this.store.isVerified(addr) : false;
      out.push({ deviceId: id, fingerprint: raw ? this.hexFingerprint(B.bufFromB64(raw)) : null, verified, addr });
    }
    return out;
  },
  async setVerified(addr, verified){
    await this.store.setVerified(addr, verified);
  },
  // "Мёртвые" identity - устройства, чей ключ мы когда-то запомнили (доверенный
  // или даже отмеченный проверенным), но которых больше НЕТ в текущем
  // device-list контакта. Типичная причина - контакт переустановил клиент и
  // получил новый device-id: это не "смена ключа у того же устройства"
  // (см. isPendingReverify выше), а появление нового устройства + осиротевшее
  // старое, которое сам протокол никогда не удалит - контакт больше не
  // публикует retract на старый device-id, просто перестаёт им пользоваться.
  // Раньше такой ключ так и оставался в списке доверенных навсегда.
  async orphanedFingerprints(bareJid){
    const currentIds = new Set((await this.getDeviceList(bareJid)).map(String));
    const prefix = bareJid + '.';
    const identifiers = await this.store.listKnownIdentities(prefix);
    const out = [];
    for(const addr of identifiers){
      const deviceId = addr.slice(prefix.length);
      if(currentIds.has(deviceId)) continue; // всё ещё актуальное устройство - не осиротевшее
      const raw = await this.store.getIdentityRaw(addr);
      const verified = raw ? await this.store.isVerified(addr) : false;
      out.push({ deviceId, fingerprint: raw ? this.hexFingerprint(B.bufFromB64(raw)) : null, verified, addr });
    }
    return out;
  },
  // Ручное "забыть устройство" - для осиротевших identity из orphanedFingerprints
  // (см. выше), а также как аварийный выход для пользователя, который прямо
  // не доверяет конкретному устройству и не хочет ждать, пока оно само
  // отвалится из списка. Чистит identity+verified+pendingReverify И сессию -
  // если контакт когда-нибудь всё же пришлёт с этого device-id сообщение
  // снова, TOFU отработает с нуля, как для совсем нового устройства.
  async forgetDevice(bareJid, addr){
    await this.store.identity.deleteIdentity(addr);
    await this.store.removeSession(addr);
  },

  // ---------- лимит запоминаемых устройств на контакта ----------
  async getMaxDevicesPerContact(){
    return await this.store.identity.getMaxDevicesPerContact();
  },
  async setMaxDevicesPerContact(n){
    return await this.store.identity.setMaxDevicesPerContact(n);
  },
  // Устройства, чей ключ пришёл, когда для контакта уже было занято все
  // слоты (см. crypto/identity-store.js:isTrustedIdentity) - ждут решения
  // пользователя: заменить один из существующих или просто освободить слот.
  async pendingSlotDevices(bareJid){
    const entries = await this.store.identity.listPendingSlotDevices(bareJid);
    return entries.map(e => ({
      deviceId: e.identifier.slice((e.bareJid + '.').length),
      fingerprint: this.hexFingerprint(B.bufFromB64(e.b64)),
      addr: e.identifier,
      ts: e.ts,
    }));
  },
  // Принимает новое устройство на место evictAddr (если указан) - тогда
  // старый ключ/сессия сначала полностью забываются (как forgetDevice), а
  // затем ключ из очереди становится доверенным. Без evictAddr - просто
  // пробуем принять (сработает, только если к этому моменту слот уже
  // освободился, например пользователь удалил другое устройство отдельно).
  async acceptPendingDevice(bareJid, newAddr, evictAddr){
    if(evictAddr){
      await this.forgetDevice(bareJid, evictAddr);
    }
    return await this.store.identity.resolvePendingSlot(newAddr);
  },
  // Отклонить новое устройство - просто забыть его ключ из очереди, не
  // освобождая и не занимая ни один слот.
  async discardPendingDevice(newAddr){
    await this.store.identity.discardPendingSlotDevice(newAddr);
  },
});
