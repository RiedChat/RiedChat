// ===================== crypto/omemo/decrypt.js =====================
// Расшифровка входящего OMEMO-сообщения (только omemo:2).
import { NS_OMEMO } from '../../core/constants.js';
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

Object.assign(omemo, {
  // ---------- расшифровка входящего сообщения ----------
  async decryptStanza(stanza){
    // Сбрасываем флаг предыдущей попытки - иначе, если ЭТА расшифровка
    // пройдёт успешно, incoming.js мог бы ошибочно показать toast от
    // прошлого, уже неактуального провала (см. lastDecryptFailReason ниже).
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
    // <keys jid="..."><key rid=.../></keys> - берём только группу, адресованную нам
    // (моему bare jid), внутри неё ищем ключ для нашего deviceId.
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
    const encBytes = new Uint8Array(B.bufFromB64(myKeyEl.textContent));
    const binStr = this._bytesToBinStr(encBytes);

    let keyTagBuf;
    try{
      keyTagBuf = isPreKey
        // ВАЖНО: обязательно указывать encoding='binary'. Если не указать,
        // ByteBuffer.wrap внутри decrypt*WhisperMessage по умолчанию трактует
        // строку как UTF-8, а наш binStr - это "бинарная строка" (каждый
        // char-code 0-255 = один сырой байт). Начиная с первого же байта
        // >= 0x80 UTF-8-декодер коверкает байты, и дальше все смещения полей
        // в протобафе съезжают.
        ? await cipher.decryptPreKeyWhisperMessage(binStr, 'binary')
        : await cipher.decryptWhisperMessage(binStr, 'binary');
    }catch(e){
      console.warn('OMEMO: ошибка расшифровки ключа сообщения', e);
      debugLog('decrypt FAIL (prekey=' + isPreKey + '): ' + (e && e.message ? e.message : e));
      // Частный случай, а не просто "сессия повреждена": libsignal бросает
      // 'Unknown identity key' конкретно тогда, когда наша isTrustedIdentity
      // (crypto/identity-store.js) вернула false - а она это делает ровно
      // тогда, когда для контакта уже занято максимум слотов запоминаемых
      // устройств и это устройство ушло в очередь pendingSlotKey (см. там же).
      // Отличаем этот случай явно - иначе пользователь видит невнятное
      // "сессия повреждена", хотя реальная причина в том, что ОН САМ должен
      // принять решение в OMEMO-меню (заменить/удалить одно из устройств),
      // и молча ждать нечего - новая сессия сама не появится.
      const addr = address.toString();
      const pendingHere = await this.store.identity.listPendingSlotDevices(fromBare);
      if(pendingHere.some(p => p.identifier === addr)){
        this.lastDecryptFailReason = 'pending-device';
        this.lastDecryptFailBareJid = fromBare;
        return t('omemo.pendingDeviceMessage');
      }
      this.lastDecryptFailReason = null;
      return t('omemo.sessionBroken');
    }
    if(isPreKey){
      // isPreKey=true - собеседник прислал НОВОЕ key-exchange-сообщение,
      // т.е. устройство только что "запросилось само" заново (см.
      // crypto/identity-store.js:setPendingReverify) - если оно до этого
      // было скрыто из списка отпечатков из-за смены ключа, самое время
      // вернуть его обратно, чтобы можно было сверить и отметить проверенным.
      await this.store.clearPendingReverify(address.toString());
    }

    const keyTag = new Uint8Array(keyTagBuf);

    const payloadEl = encEl.querySelector('payload');
    if(!payloadEl){
      // OMEMO Key Transport / "пустое" сообщение - используется только для
      // управления сессией (например, автоответ на key exchange), текста нет.
      return null;
    }
    const contentKey = keyTag.slice(0, 32);
    const macTrunc = keyTag.slice(32, 48);
    const ciphertext = new Uint8Array(B.bufFromB64(payloadEl.textContent));
    try{
      const hk = await B.hkdfSha256(contentKey, new Uint8Array(32), 'OMEMO Payload', 80);
      const encKey = hk.slice(0, 32);
      const authKey = hk.slice(32, 64);
      const cbcIv = hk.slice(64, 80);

      const macFull = await B.hmacSha256(authKey, ciphertext);
      const macCheck = macFull.slice(0, 16);
      // Constant-time сравнение: НЕ выходим из цикла раньше времени по первому
      // несовпадению байта - ранний break создаёт тайминг-канал, по которому
      // теоретически можно подбирать/различать валидность тега побайтово.
      let diff = macCheck.length ^ macTrunc.length;
      const len = Math.max(macCheck.length, macTrunc.length);
      for(let i = 0; i < len; i++){
        const a = i < macCheck.length ? macCheck[i] : 0;
        const b = i < macTrunc.length ? macTrunc[i] : 0;
        diff |= (a ^ b);
      }
      if(diff !== 0){
        debugLog('OMEMO v2: HMAC-SHA-256 payload не совпал - сообщение повреждено или подделано, отбрасываю.');
        return t('omemo.integrityFailed');
      }

      const envelopeBytes = await B.aesCbcDecrypt(encKey, cbcIv, ciphertext);
      return this._parseSceEnvelope(envelopeBytes, fromBare);
    }catch(e){
      console.warn('OMEMO: ошибка расшифровки v2 payload (HKDF/AES-CBC/HMAC/SCE)', e);
      debugLog('v2 payload decrypt FAIL: ' + (e && e.message ? e.message : e));
      return t('omemo.decryptFailed');
    }
  },

  _binStrToBytes(binStr){
    const arr = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) arr[i] = binStr.charCodeAt(i) & 0xff;
    return arr;
  },
  _bytesToBinStr(bytes){
    let s = '';
    for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
    return s;
  },
});
