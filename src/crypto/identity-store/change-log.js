// ============= crypto/identity-store/change-log.js =============
// Лог смены identity-ключей контактов (для UI-предупреждения
// "ключ контакта изменился").
export const changeLog = {
  async _flagIdentityChange(identifier, oldB64, newB64){
    const logKey = this.ns + 'identityChangeLog:' + identifier;
    await this.idb.set(logKey, { oldKey: oldB64, newKey: newB64, ts: Date.now(), acknowledged: false });
  },
  // Возвращает все ещё не подтверждённые пользователем смены ключей.
  async listPendingIdentityChanges(){
    const prefix = this.ns + 'identityChangeLog:';
    const keys = await this.idb.keys(prefix);
    const out = [];
    for(const k of keys){
      const entry = await this.idb.get(k);
      if(entry && !entry.acknowledged){
        out.push(Object.assign({ identifier: k.slice(prefix.length) }, entry));
      }
    }
    return out;
  },
  // Помечает смену ключа как показанную пользователю (не даёт больше всплывать).
  async acknowledgeIdentityChange(identifier){
    const logKey = this.ns + 'identityChangeLog:' + identifier;
    const entry = await this.idb.get(logKey);
    if(entry){
      entry.acknowledged = true;
      await this.idb.set(logKey, entry);
    }
  },
};
