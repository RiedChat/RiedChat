// ===================== crypto/session-store.js =====================
// Signal-сессии устройств собеседников + app-level meta-кэш (напр. для omemo/state.js).
export const sessionMethods = {
  // ---- sessions ----
  loadSession(identifier){ return this._get('session', identifier).then(v => v || undefined); },
  storeSession(identifier, record){ return this._set('session', identifier, record); },
  removeSession(identifier){ return this._del('session', identifier); },
  async removeAllSessions(identifier){
    const keys = await this.idb.keys(this._k('session', identifier));
    for(const k of keys) await this.idb.del(k);
  },

  // ---- misc app-level cache ----
  setMeta(key, val){ return this._set('meta', key, val); },
  getMeta(key){ return this._get('meta', key); },
};
