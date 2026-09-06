// ============= crypto/identity-store/device-limit.js =============
// Лимит запоминаемых устройств на контакта (настройка пользователя,
// 1..5, по умолчанию 5) и очередь устройств, не влезших в лимит
// (pendingSlotKey).
export const deviceLimit = {
  async getMaxDevicesPerContact(){
    const v = await this.idb.get(this.ns + 'settings:maxDevicesPerContact');
    return v && v >= 1 && v <= 5 ? v : 5; // по умолчанию 5, как и было де-факто раньше
  },
  async setMaxDevicesPerContact(n){
    const clamped = Math.max(1, Math.min(5, Number(n) || 5));
    await this.idb.set(this.ns + 'settings:maxDevicesPerContact', clamped);
    return clamped;
  },
  async countTrustedDevices(bareJid){
    return (await this.listKnownIdentities(bareJid + '.')).length;
  },

  async listPendingSlotDevices(bareJidFilter){
    const prefix = this.ns + 'pendingSlotKey:';
    const keys = await this.idb.keys(prefix);
    const out = [];
    for(const k of keys){
      const entry = await this.idb.get(k);
      if(!entry || (bareJidFilter && entry.bareJid !== bareJidFilter)) continue;
      const identifier = k.slice(prefix.length);
      // Защита от уже осиротевших на диске записей (см. isTrustedIdentity):
      // если identifier с тех пор всё-таки стал доверенным по обычному
      // TOFU-пути, запись pendingSlotKey - мусор, а не реальный "кандидат
      // ждёт места". Удаляем её тут же, а не только пропускаем в выдаче.
      const alreadyTrusted = await this.idb.get(this.ns + 'trustedIdentity:' + identifier);
      if(alreadyTrusted){
        await this.idb.del(k);
        continue;
      }
      out.push(Object.assign({ identifier }, entry));
    }
    return out;
  },
  async discardPendingSlotDevice(identifier){
    await this.idb.del(this.ns + 'pendingSlotKey:' + identifier);
  },
  // Принимает ключ из очереди как доверенный, освободив для него слот
  // (место старого устройства должен был убрать вызывающий код -
  // см. omemo/trust.js:acceptPendingDevice, который сначала зовёт
  // deleteIdentity/removeSession для evictIdentifier, потом это).
  async resolvePendingSlot(identifier){
    const pendingKey = this.ns + 'pendingSlotKey:' + identifier;
    const entry = await this.idb.get(pendingKey);
    if(!entry) return false;
    await this.idb.set(this.ns + 'trustedIdentity:' + identifier, entry.b64);
    await this.idb.set(this.ns + 'identityVerified:' + identifier, false);
    await this.idb.del(pendingKey);
    return true;
  },
};
