// ===================== crypto/omemo/decrypt.js =====================
// Расшифровка входящего OMEMO-сообщения (только omemo:2).
import { NS_OMEMO } from '../../core/constants.js';
import { debugLog, errMsg } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';
import * as B from '../bytes.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- расшифровка входящего сообщения ----------
  async decryptStanza(stanza, retried = false){
    // Сбрасываем флаг прошлой попытки, чтобы incoming.js не показал toast по устаревшему провалу (см. lastDecryptFailReason).
    this.lastDecryptFailReason = null;
    const encEl = stanza.querySelector('encrypted');
    if(!encEl) return null;
    if(encEl.namespaceURI !== NS_OMEMO){
      debugLog('входящий <encrypted> с неизвестным namespace: "' + encEl.namespaceURI + '" - игнорирую.');
      return null;
    }
    if(!this.ready) return t('omemo.notReady');

    const header = encEl.querySelector('header');
    const sid = parseInt(header.getAttribute('sid'), 10);
    const fromBare = Strophe.getBareJidFromJid(stanza.getAttribute('from'));
    this._learnIncomingDevice(fromBare, sid);
    // <keys jid="..."><key rid=.../></keys>: берём группу для нашего bare jid и в ней ключ для нашего deviceId.
    const myKeysGroup = Array.from(header.querySelectorAll('keys')).find(k => k.getAttribute('jid') === this.myBareJid);
    const keyEls = myKeysGroup ? Array.from(myKeysGroup.querySelectorAll('key')) : [];
    const myKeyEl = keyEls.find(k => parseInt(k.getAttribute('rid'),10) === this.deviceId);
    if(!myKeyEl){
      debugLog('входящее OMEMO(v2) от ' + fromBare + ' (sid=' + sid + '): моего deviceId=' + this.deviceId + ' нет среди получателей');
      return null; // сообщение адресовано другому нашему устройству
    }

    const isPreKey = myKeyEl.getAttribute('kex') === 'true';
    const address = new libsignal.SignalProtocolAddress(fromBare, sid);
    const cipher = new libsignal.SessionCipher(this.store, address);
    const binStr = atob(myKeyEl.textContent); // бинарная строка: char-code 0-255 = байт

    let keyTagBuf;
    try{
      keyTagBuf = isPreKey
        // Обязателен encoding='binary': иначе ByteBuffer.wrap трактует строку как UTF-8
        // и на байтах >= 0x80 ломает смещения protobuf.
        ? await cipher.decryptPreKeyWhisperMessage(binStr, 'binary')
        : await cipher.decryptWhisperMessage(binStr, 'binary');
    }catch(e){
      console.warn('OMEMO: ошибка расшифровки ключа сообщения', e);
      debugLog('decrypt FAIL (prekey=' + isPreKey + '): ' + errMsg(e));
      // libsignal бросает 'Unknown identity key', когда isTrustedIdentity вернула false:
      // у контакта заняты все слоты устройств, устройство в очереди pendingSlotKey.
      // Отличаем явно: нужно решение пользователя в OMEMO-меню, сама сессия не появится.
      const addr = address.toString();
      const pendingHere = await this.store.listPendingSlotDevices(fromBare);
      if(pendingHere.some(p => p.identifier === addr)){
        if(!retried){
          await this.getDeviceList(fromBare, true);
          const orphans = (await this.orphanedFingerprints(fromBare)).filter(o => !o.verified);
          if(orphans.length){
            for(const o of orphans) await this.forgetDevice(o.addr);
            await this.store.resolvePendingSlot(addr);
            debugLog('decrypt: освобождено слотов ' + orphans.length + ' у ' + fromBare + ', повторяю расшифровку');
            return this.decryptStanza(stanza, true);
          }
        }
        this.lastDecryptFailReason = 'pending-device';
        this.lastDecryptFailBareJid = fromBare;
        return t('omemo.pendingDeviceMessage');
      }
      this.lastDecryptFailReason = null;
      return t('omemo.sessionBroken');
    }
    if(isPreKey){
      // isPreKey=true: устройство запросилось заново (identity-store.js:setPendingReverify) -
      // возвращаем в список отпечатков, если оно было скрыто из-за смены ключа.
      await this.store.clearPendingReverify(address.toString());
      // libsignal удалил использованный одноразовый prekey - сразу проверяем остаток и при падении
      // ниже порога пополняем и перепубликуем bundle (omemo/state.js:replenishPreKeysIfNeeded),
      // иначе запас можно исчерпать целенаправленно.
      this.replenishPreKeysIfNeeded()
        .then(replenished => { if(replenished) return this._publishBundleCoalesced(); })
        .catch(e => debugLog('OMEMO: пополнение prekeys после decrypt упало: ' + errMsg(e)));
    }

    const keyTag = new Uint8Array(keyTagBuf);

    const payloadEl = encEl.querySelector('payload');
    if(!payloadEl){
      // OMEMO Key Transport / пустое сообщение: только управление сессией (напр. автоответ на key exchange), текста нет.
      return null;
    }
    const contentKey = keyTag.slice(0, 32);
    const macTrunc = keyTag.slice(32, 48);
    const ciphertext = new Uint8Array(B.bufFromB64(payloadEl.textContent));
    try{
      const { encKey, authKey, iv: cbcIv } = await B.omemoPayloadKeys(contentKey);

      const macFull = await B.hmacSha256(authKey, ciphertext);
      const macCheck = macFull.slice(0, 16);
      if(!B.timingSafeEqual(macCheck, macTrunc)){
        debugLog('OMEMO v2: HMAC-SHA-256 payload не совпал - сообщение повреждено или подделано, отбрасываю.');
        return t('omemo.integrityFailed');
      }

      const envelopeBytes = await B.aesCbc('decrypt', encKey, cbcIv, ciphertext);
      return this._parseSceEnvelope(envelopeBytes, fromBare);
    }catch(e){
      console.warn('OMEMO: ошибка расшифровки v2 payload (HKDF/AES-CBC/HMAC/SCE)', e);
      debugLog('v2 payload decrypt FAIL: ' + errMsg(e));
      return t('omemo.decryptFailed');
    }
  },
});
