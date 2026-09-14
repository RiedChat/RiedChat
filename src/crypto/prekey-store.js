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
  // Сколько одноразовых prekeys ещё не израсходовано - нужно
  // omemo/state.js:replenishPreKeysIfNeeded, чтобы решить, пора ли
  // догенерировать новые.
  async countPreKeys(){
    const keys = await this.idb.keys(this.ns + 'preKey:');
    return keys.length;
  }
  // Максимальный уже использованный (в т.ч. когда-то опубликованный, но с
  // тех пор израсходованный и удалённый) id prekey - нужен как фолбэк для
  // выбора id следующей пачки, если ещё нет meta-счётчика nextPreKeyId
  // (например, аккаунт создан до появления пополнения prekeys). Берём max
  // среди ЕЩЁ ХРАНЯЩИХСЯ ключей - этого достаточно, чтобы не переиспользовать
  // id ключа, который прямо сейчас может быть опубликован и не использован.
  async maxPreKeyId(){
    const prefix = this.ns + 'preKey:';
    const keys = await this.idb.keys(prefix);
    if(!keys.length) return 0;
    return Math.max(...keys.map(k => parseInt(k.slice(prefix.length), 10)));
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
