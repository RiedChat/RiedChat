// ===================== crypto/omemo/session-builder.js =====================
// Загрузка bundle устройства и установка Signal-сессии (X3DH). device-list - в device-list-discovery.js.
import { NS_OMEMO_BUNDLES_PREFIX, NS_PUBSUB } from '../../core/constants.js';
import { sendIqSafe } from '../../core/iq.js';
import * as B from '../bytes.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  async _fetchBundle(bareJid, deviceId){
    const { $iq } = window;
    const node = NS_OMEMO_BUNDLES_PREFIX + deviceId;
    const iq = $iq({type:'get', to: bareJid})
      .c('pubsub', {xmlns: NS_PUBSUB})
      .c('items', {node});
    const res = await sendIqSafe(iq, undefined, this.connection);
    if(!res) throw new Error('no bundle');
    const bundleEl = res.querySelector('bundle');
    if(!bundleEl) throw new Error('empty bundle');
    const spkEl = bundleEl.querySelector('spk');
    const spksEl = bundleEl.querySelector('spks');
    const ikEl = bundleEl.querySelector('ik');
    const pkEls = bundleEl.querySelectorAll('prekeys pk');
    if(!spkEl || !spksEl || !ikEl || !pkEls.length) throw new Error('bad bundle');
    const pks = Array.from(pkEls);
    const chosen = pks[Math.floor(Math.random()*pks.length)];
    return {
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
    };
  },

  // Параллельные вызовы на одно устройство делят одну сборку сессии: иначе две X3DH с разными случайными
  // one-time prekey подряд перезаписывали друг друга и тратили лишние prekeys собеседника.
  _ensureSession(bareJid, deviceId){
    const inflight = (this._sessionInflight = this._sessionInflight || {});
    const key = bareJid + ':' + deviceId;
    if(!inflight[key]){
      inflight[key] = this._ensureSessionOnce(bareJid, deviceId).finally(() => { delete inflight[key]; });
    }
    return inflight[key];
  },

  async _ensureSessionOnce(bareJid, deviceId){
    const address = new libsignal.SignalProtocolAddress(bareJid, deviceId);
    const existing = await this.store.loadSession(address.toString());
    if(existing) return new libsignal.SessionCipher(this.store, address);

    const bundle = await this._fetchBundle(bareJid, deviceId);
    const builder = new libsignal.SessionBuilder(this.store, address);
    await builder.processPreKey({
      // registrationId нельзя оставлять undefined: record.serialize() падает с "unsure of how to jsonify".
      // В bundle настоящего registrationId собеседника нет - используем заглушку (на X3DH/Double Ratchet не влияет).
      registrationId: 0,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      preKey: bundle.preKey,
    });
    // Исходящая сессия построена с нуля - как и входящий prekey-message (omemo/decrypt.js),
    // возвращаем скрытое из-за смены ключа устройство в список отпечатков (identity-store.js:setPendingReverify).
    await this.store.clearPendingReverify(address.toString());
    return new libsignal.SessionCipher(this.store, address);
  },
});
