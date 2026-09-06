// ===================== crypto/prekey-store.js =====================
// Хранение одноразовых preKey и signedPreKey (libsignal SessionBuilder
// читает/пишет их через эти методы при установке новой сессии).
import { bytes as B } from './bytes.js';

export class PreKeyStore{
  constructor(idb, ns){
    this.idb = idb;
    this.ns = ns; // 'omemo:' + bareJid + ':'
  }

  // ---- prekeys ----
  async loadPreKey(keyId){
    const v = await this.idb.get(this.ns + 'preKey:' + keyId);
    return v ? B.unpackKeyPair(v) : undefined;
  }
  async storePreKey(keyId, keyPair){
    await this.idb.set(this.ns + 'preKey:' + keyId, B.packKeyPair(keyPair));
  }
  async removePreKey(keyId){
    await this.idb.del(this.ns + 'preKey:' + keyId);
  }

  // ---- signed prekey ----
  async loadSignedPreKey(keyId){
    const v = await this.idb.get(this.ns + 'signedPreKey:' + keyId);
    return v ? B.unpackKeyPair(v) : undefined;
  }
  async storeSignedPreKey(keyId, keyPair){
    await this.idb.set(this.ns + 'signedPreKey:' + keyId, B.packKeyPair(keyPair));
  }
  async removeSignedPreKey(keyId){
    await this.idb.del(this.ns + 'signedPreKey:' + keyId);
  }
}
