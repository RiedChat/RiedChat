// ===================== crypto/session-store.js =====================
// Signal-сессии по устройствам собеседников + произвольный meta-кэш
// уровня приложения (используется поверх того же namespace, например
// omemo/state.js для служебных пометок).

export class SessionStore{
  constructor(idb, ns){
    this.idb = idb;
    this.ns = ns; // 'omemo:' + bareJid + ':'
  }

  // ---- sessions ----
  async loadSession(identifier){
    const v = await this.idb.get(this.ns + 'session:' + identifier);
    return v || undefined;
  }
  async storeSession(identifier, record){
    await this.idb.set(this.ns + 'session:' + identifier, record);
  }
  async removeSession(identifier){
    await this.idb.del(this.ns + 'session:' + identifier);
  }
  async removeAllSessions(identifier){
    const keys = await this.idb.keys(this.ns + 'session:' + identifier);
    for(const k of keys) await this.idb.del(k);
  }

  // ---- misc app-level cache ----
  async setMeta(key, val){ await this.idb.set(this.ns + 'meta:' + key, val); }
  async getMeta(key){ return await this.idb.get(this.ns + 'meta:' + key); }
}
