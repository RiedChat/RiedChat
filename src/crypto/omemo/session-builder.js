// ===================== crypto/omemo/session-builder.js =====================
// Загрузка bundle конкретного устройства и установление Signal-сессии
// (X3DH). Получение самого device-list - в device-list-discovery.js.
import { IQ_TIMEOUT_MS, NS_OMEMO_BUNDLES_PREFIX, NS_PUBSUB } from '../../core/constants.js';
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';

Object.assign(omemo, {
  async _fetchBundle(bareJid, deviceId){
    const { $iq } = window;
    const node = NS_OMEMO_BUNDLES_PREFIX + deviceId;
    return new Promise((resolve, reject) => {
      const iq = $iq({type:'get', to: bareJid})
        .c('pubsub', {xmlns: NS_PUBSUB})
        .c('items', {node});
      this.connection.sendIQ(iq, (res) => {
        const bundleEl = res.querySelector('bundle');
        if(!bundleEl) return reject(new Error('empty bundle'));
        const spkEl = bundleEl.querySelector('spk');
        const spksEl = bundleEl.querySelector('spks');
        const ikEl = bundleEl.querySelector('ik');
        const pkEls = bundleEl.querySelectorAll('prekeys pk');
        if(!spkEl || !spksEl || !ikEl || !pkEls.length) return reject(new Error('bad bundle'));
        const pks = Array.from(pkEls);
        const chosen = pks[Math.floor(Math.random()*pks.length)];
        resolve({
          identityKey: B.bufFromB64(ikEl.textContent),
          signedPreKey: {
            keyId: parseInt(spkEl.getAttribute('id'), 10),
            publicKey: B.bufFromB64(spkEl.textContent),
            signature: B.bufFromB64(spksEl.textContent),
          },
          preKey: {
            keyId: parseInt(chosen.getAttribute('id'), 10),
            publicKey: B.bufFromB64(chosen.textContent),
          }
        });
      }, () => reject(new Error('no bundle')), IQ_TIMEOUT_MS);
    });
  },

  async _ensureSession(bareJid, deviceId){
    const address = new libsignal.SignalProtocolAddress(bareJid, deviceId);
    const existing = await this.store.loadSession(address.toString());
    if(existing) return new libsignal.SessionCipher(this.store, address);

    const bundle = await this._fetchBundle(bareJid, deviceId);
    const builder = new libsignal.SessionBuilder(this.store, address);
    await builder.processPreKey({
      // ВАЖНО: registrationId нельзя оставлять undefined - SessionBuilder
      // кладёт его как есть в объект сессии, а при следующем record.serialize()
      // внутренний JSON-сериализатор падает с "unsure of how to jsonify
      // object of type undefined". Мы не публикуем/не получаем настоящий
      // registrationId устройства собеседника через bundle (в этом XEP он
      // туда не входит), поэтому используем безобидную заглушку - на саму
      // криптографию (X3DH/Double Ratchet) это не влияет, он используется
      // только для служебного учёта на стороне отправителя.
      registrationId: 0,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      preKey: bundle.preKey,
    });
    // Новая исходящая сессия построена с нуля - если устройство было скрыто
    // из списка отпечатков из-за смены ключа (см. crypto/identity-store.js:
    // setPendingReverify), это точно такой же "оно запросилось само заново"
    // момент, что и входящий prekey-message (см. crypto/omemo/decrypt.js).
    await this.store.clearPendingReverify(address.toString());
    return new libsignal.SessionCipher(this.store, address);
  },
});
