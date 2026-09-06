// ============= crypto/identity-store/device-log.js =============
// Лог новых устройств контакта (для уведомления "у контакта появилось
// новое устройство"). Отдельно от change-log.js (тот - про смену ключа
// уже известного устройства, этот - про появление устройства, которого
// раньше вообще не было в списке получателей).
export const deviceLog = {
  async hasAnyKnownDevice(bareJid){
    const keys = await this.idb.keys(this.ns + 'knownDevice:' + bareJid + ':');
    return keys.length > 0;
  },
  async isKnownDevice(bareJid, deviceId){
    return !!(await this.idb.get(this.ns + 'knownDevice:' + bareJid + ':' + deviceId));
  },
  async markDeviceKnown(bareJid, deviceId){
    await this.idb.set(this.ns + 'knownDevice:' + bareJid + ':' + deviceId, true);
  },
  async flagNewDevice(bareJid, deviceId){
    const logKey = this.ns + 'deviceChangeLog:' + bareJid + ':' + deviceId;
    await this.idb.set(logKey, { bareJid, deviceId, ts: Date.now(), acknowledged: false });
  },
  // Возвращает все ещё не подтверждённые пользователем новые устройства,
  // опционально отфильтрованные по bareJid контакта.
  async listPendingDeviceChanges(bareJidFilter){
    const prefix = this.ns + 'deviceChangeLog:';
    const keys = await this.idb.keys(prefix);
    const out = [];
    for(const k of keys){
      const entry = await this.idb.get(k);
      if(entry && !entry.acknowledged && (!bareJidFilter || entry.bareJid === bareJidFilter)){
        out.push(entry);
      }
    }
    return out;
  },
  async acknowledgeDeviceChange(bareJid, deviceId){
    const logKey = this.ns + 'deviceChangeLog:' + bareJid + ':' + deviceId;
    const entry = await this.idb.get(logKey);
    if(entry){
      entry.acknowledged = true;
      await this.idb.set(logKey, entry);
    }
  },
};
