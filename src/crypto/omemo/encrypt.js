// ===================== crypto/omemo/encrypt.js =====================
// Шифрование исходящего сообщения для всех устройств собеседника и наших (синхронизация). Только omemo:2.
import { NS_OMEMO } from '../../core/constants.js';
import { debugLog, errMsg } from '../../core/debug-log.js';
import { parseXml } from '../../core/dom-utils.js';
import * as B from '../bytes.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- шифрование исходящего сообщения ----------
  // Возвращает DOM-элемент <encrypted> или null, если у собеседника нет OMEMO-устройств.
  async encryptFor(toBareJid, plaintext){
    if(!this.ready) return null;
    // Кэш обновляется PEP-пушами (_applyPushedDeviceList) и TTL; forceRefresh на каждую отправку не нужен.
    const recipientDevices = await this.getDeviceList(toBareJid);
    if(!recipientDevices.length) return null;

    // Уведомляем о новых устройствах собеседника (PEP-пуш или _learnIncomingDevice), на которые сейчас зашифруем.
    // Первое сообщение контакту (hadKnownDevicesBefore === false) не считается - обычный TOFU.
    const hadKnownDevicesBefore = await this.store.hasAnyKnownDevice(toBareJid);
    for(const id of recipientDevices){
      const known = await this.store.isKnownDevice(toBareJid, id);
      if(!known){
        await this.store.markDeviceKnown(toBareJid, id);
        if(hadKnownDevicesBefore){
          await this.store.flagNewDevice(toBareJid, id);
          debugLog('OMEMO: у ' + toBareJid + ' появилось новое устройство id=' + id + ' - залогировано для уведомления пользователя');
        }
      }
    }

    // Синхронизацию на свои устройства делаем всегда (свой bundle опубликован под omemo:2).
    const ownDevices = (await this.getDeviceList(this.myBareJid)).filter(id => id !== this.deviceId);

    // XEP-0384 omemo:2 (§4.4 Message Encryption):
    // 1) текст оборачивается в SCE-конверт (XEP-0420);
    // 2) генерируется случайный 32-байтный ключ;
    // 3) HKDF-SHA-256(ключ, соль=32 нулевых байта, info="OMEMO Payload", 80 байт) делится на
    //    ключ шифрования (32), ключ аутентификации (32) и IV (16);
    // 4) конверт шифруется AES-256-CBC + PKCS7;
    // 5) HMAC-SHA-256 над шифротекстом (усечён до 16 байт) добавляется к ключу и шифруется
    //    Double Ratchet'ом на каждое устройство-получатель.
    // IV/ключ шифрования в XML не передаются (получатель выводит их заново), поэтому <iv> в <header> нет.
    const envelopeBytes = this._buildSceEnvelope(plaintext, this.myBareJid);
    const contentKey = B.randomBytes(32);
    const { encKey, authKey, iv: cbcIv } = await B.omemoPayloadKeys(contentKey);
    const ciphertext = await B.aesCbc('encrypt', encKey, cbcIv, envelopeBytes);
    const macFull = await B.hmacSha256(authKey, ciphertext);
    const macTrunc = macFull.slice(0, 16);
    const keyAndTag = B.concat(contentKey, macTrunc); // 48 байт: 32 ключ + 16 усечённый HMAC

    const targets = [];
    recipientDevices.forEach(id => targets.push({jid: toBareJid, id}));
    ownDevices.forEach(id => targets.push({jid: this.myBareJid, id}));

    const keysByJid = {};    // сгруппировано по получателю <keys jid="..."><key rid=.../></keys>
    const failed = [];
    for(const t of targets){
      try{
        const cipher = await this._ensureSession(t.jid, t.id);
        const enc = await cipher.encrypt(keyAndTag.buffer);
        const b64 = btoa(enc.body); // enc.body - бинарная строка (char-code 0-255 = байт)
        const isPreKey = enc.type === 3;
        const keyXml = `<key rid="${t.id}"${isPreKey ? ' kex="true"' : ''}>${b64}</key>`;
        // omemo:2 требует группировки ключей по bare JID получателя в <keys jid="..."> внутри <header>,
        // иначе Conversations/Gajim не находят свой ключ.
        (keysByJid[t.jid] = keysByJid[t.jid] || []).push(keyXml);
      }catch(e){
        console.warn('OMEMO: не удалось зашифровать для устройства', t, e);
        debugLog('шифрование для ' + t.jid + ':' + t.id + ' FAIL: ' + errMsg(e));
        failed.push(t);
      }
    }
    const headerKeysXml = Object.keys(keysByJid).map(jid => `<keys jid="${jid}">${keysByJid[jid].join('')}</keys>`).join('');
    const gotRecipientKeys = !!(keysByJid[toBareJid] && keysByJid[toBareJid].length > 0);
    if(!gotRecipientKeys){
      // Устройства собеседника есть, но сессия не установилась ни на одно - вероятно, все ID мёртвые
      // (протухшие бандлы). Свои устройства (myBareJid) не считаются: доставку собеседнику они не гарантируют.
      debugLog('шифрование НЕВОЗМОЖНО для ' + toBareJid + ': все ' + recipientDevices.length + ' устройств(о) недоступны - сообщение уйдёт без OMEMO');
      this.lastEncryptFailReason = 'all-devices-dead';
      return null;
    }
    this.lastEncryptFailReason = null;

    const xml = `<encrypted xmlns="${NS_OMEMO}">` +
      `<header sid="${this.deviceId}">${headerKeysXml}</header>` +
      `<payload>${B.b64FromBuf(ciphertext)}</payload>` +
      `</encrypted>`;
    return parseXml(xml);
  },

  // Запоминаем реальный device id собеседника из заголовка входящего сообщения - источник, который не
  // устаревает (в отличие от PEP-узла с мёртвым item). Вызывается для КАЖДОГО входящего <encrypted>,
  // даже адресованного не нашему устройству.
  _learnIncomingDevice(bareJid, id){
    // Забытое устройство прислало сообщение - оно живо, возвращаем его в список.
    if(this.ignoredDevices[bareJid]?.delete(id)){
      this.store._del('ignoredDevice', bareJid + '.' + id).catch(() => {});
    }
    const rec = this.learnedDevices[bareJid];
    if(!rec){
      this.learnedDevices[bareJid] = {ids: new Set([id])};
    } else if(!rec.ids.has(id)){
      rec.ids.add(id);
      debugLog('learnedDevices: ' + bareJid + ' - новый реальный device id=' + id);
    }
    const cached = this.deviceListCache[bareJid];
    this._setDeviceList(bareJid, cached ? cached.ids : []);
  },
});
