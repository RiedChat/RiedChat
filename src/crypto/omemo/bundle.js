// ===================== crypto/omemo/bundle.js =====================
// Публикация собственного bundle (signed prekey, identity key, one-time prekeys, omemo:2) в PEP.
// device-list - в omemo/device-list-publish.js, публикация PEP-узла - в pep/publish-node.js.
import { NS_OMEMO, NS_OMEMO_BUNDLES_PREFIX } from '../../core/constants.js';
import * as B from '../bytes.js';
import { publishItem } from '../pep/publish-node.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  async _publishBundle(){
    const spkId = await this.store.getMeta('signedPreKeyId');
    const spk = await this.store.loadSignedPreKey(spkId);
    const spkSig = await this.store.getMeta('signedPreKeySignature');
    const idKeyPair = await this.store.getIdentityKeyPair();

    const preKeyIds = await this.store.listPreKeyIds();
    const pkXml = [];
    for(const id of preKeyIds){
      const pk = await this.store.loadPreKey(id);
      pkXml.push(`<pk id="${id}">${B.b64FromBuf(pk.pubKey)}</pk>`);
    }

    const xml = `<bundle xmlns="${NS_OMEMO}">` +
      `<spk id="${spkId}">${B.b64FromBuf(spk.pubKey)}</spk>` +
      `<spks>${spkSig}</spks>` +
      `<ik>${B.b64FromBuf(idKeyPair.pubKey)}</ik>` +
      `<prekeys>${pkXml.join('')}</prekeys>` +
      `</bundle>`;
    await publishItem(this.connection, NS_OMEMO_BUNDLES_PREFIX + this.deviceId, 'current', xml);
  },

  // Склеивает частые запросы на публикацию bundle (после каждого prekey-сообщения): идущая публикация не дублируется,
  // а если за время неё что-то изменилось - выполняется ровно одна повторная.
  _publishBundleCoalesced(){
    if(this._bundlePubP){
      this._bundlePubAgain = true;
      return this._bundlePubP;
    }
    this._bundlePubP = (async () => {
      try{
        do{
          this._bundlePubAgain = false;
          await this._publishBundle();
        }while(this._bundlePubAgain);
      }finally{
        this._bundlePubP = null;
      }
    })();
    return this._bundlePubP;
  },
});
