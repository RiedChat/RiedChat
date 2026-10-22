import * as B from './bytes.js';

const keyPairMethods = (kind) => ({
  async load(id){
    const v = await this._get(kind, id);
    return v ? B.unpackKeyPair(v) : undefined;
  },
  store(id, keyPair){ return this._set(kind, id, B.packKeyPair(keyPair)); },
  remove(id){ return this._del(kind, id); },
});

const preKey = keyPairMethods('preKey');
const signedPreKey = keyPairMethods('signedPreKey');

export const preKeyMethods = {
  loadPreKey: preKey.load,
  storePreKey: preKey.store,
  removePreKey: preKey.remove,
  loadSignedPreKey: signedPreKey.load,
  storeSignedPreKey: signedPreKey.store,
  removeSignedPreKey: signedPreKey.remove,

  async listPreKeyIds(){
    const prefix = this._k('preKey');
    return (await this.idb.keys(prefix)).map(k => parseInt(k.slice(prefix.length), 10));
  },
  async countPreKeys(){ return (await this.listPreKeyIds()).length; },
  async maxPreKeyId(){ return Math.max(0, ...(await this.listPreKeyIds())); },
};
