// ===================== crypto/omemo/bundle.js =====================
// Публикация собственного bundle (signed prekey, identity key, one-time
// prekeys, omemo:2) в PEP. Публикация device-list - в crypto/omemo/device-list-publish.js;
// общий механизм публикации PEP-узла (XEP-0060) - в crypto/pep/publish-node.js.
import { NS_OMEMO, NS_OMEMO_BUNDLES_PREFIX } from '../../core/constants.js';
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';

Object.assign(omemo, {
  async _publishBundle(){
    const spkId = await this.store.getMeta('signedPreKeyId');
    const spk = await this.store.loadSignedPreKey(spkId);
    const spkSig = await this.store.getMeta('signedPreKeySignature');
    const idKeyPair = await this.store.getIdentityKeyPair();

    const preKeyIds = (await this.store.idb.keys(this.store.ns + 'preKey:'))
      .map(k => parseInt(k.slice((this.store.ns + 'preKey:').length), 10));
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
    await this._publishItem(NS_OMEMO_BUNDLES_PREFIX + this.deviceId, 'current', xml);
  },
});
