// ===================== crypto/omemo/encrypt.js =====================
// Шифрование исходящего сообщения для всех устройств собеседника (+ наших
// собственных, для синхронизации между устройствами). Только omemo:2.
import { NS_OMEMO } from '../../core/constants.js';
import { _parseXml } from '../../core/dom-utils.js';
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';
import { debugLog } from '../../core/debug-log.js';

Object.assign(omemo, {
  // ---------- шифрование исходящего сообщения ----------
  // Возвращает DOM-элемент <encrypted> или null, если у собеседника нет OMEMO-устройств.
  async encryptFor(toBareJid, plaintext){
    if(!this.ready) return null;
    // Кэш обновляется пушами от PEP (см. discovery.js/_applyPushedDeviceList) и
    // подстраховочным TTL - раньше здесь стоял безусловный forceRefresh на каждую
    // отправку, что добавляло сетевой round-trip перед КАЖДЫМ сообщением.
    const recipientDevices = await this.getDeviceList(toBareJid);
    if(!recipientDevices.length) return null;

    // Уведомление о новых устройствах собеседника: PEP-пуш или _learnIncomingDevice
    // могли добавить device id, о котором пользователь ещё не знает - а мы вот-вот
    // зашифруем сообщение и на него. Первое сообщение контакту (hadKnownDevicesBefore
    // === false) не считается - это обычный TOFU при старте переписки, а не появление
    // нового устройства у уже известного контакта.
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

    // Синхронизацию себе на другие устройства делаем всегда - свой bundle
    // опубликован под omemo:2.
    const ownDevices = (await this.getDeviceList(this.myBareJid)).filter(id => id !== this.deviceId);

    // Настоящий XEP-0384 omemo:2 (§4.4 Message Encryption):
    // 1) текст оборачивается в SCE-конверт (XEP-0420);
    // 2) генерируется случайный 32-байтный ключ;
    // 3) HKDF-SHA-256(ключ, соль=32 нулевых байта, info="OMEMO Payload", 80 байт)
    //    делится на 32-байтный ключ шифрования, 32-байтный ключ аутентификации и 16-байтный IV;
    // 4) конверт шифруется AES-256-CBC + PKCS7 этим ключом/IV;
    // 5) HMAC-SHA-256 над шифротекстом (усечённый до 16 байт) добавляется к ключу
    //    и вместе с ним шифруется Double Ratchet'ом на каждое устройство-получатель.
    // Сам IV/ключ шифрования никуда в XML не попадают - получатель выводит их
    // из 32-байтного ключа заново, поэтому в <header> нет <iv>.
    const envelopeBytes = this._buildSceEnvelope(plaintext, this.myBareJid);
    const contentKey = B.randomBytes(32);
    const hk = await B.hkdfSha256(contentKey, new Uint8Array(32), 'OMEMO Payload', 80);
    const encKey = hk.slice(0, 32);
    const authKey = hk.slice(32, 64);
    const cbcIv = hk.slice(64, 80);
    const ciphertext = await B.aesCbcEncrypt(encKey, cbcIv, envelopeBytes);
    const macFull = await B.hmacSha256(authKey, ciphertext);
    const macTrunc = macFull.slice(0, 16);
    const payloadBytes = ciphertext;
    const keyAndTag = B.concat(contentKey, macTrunc); // 48 байт: 32 ключ + 16 усечённый HMAC

    const targets = [];
    recipientDevices.forEach(id => targets.push({jid: toBareJid, id}));
    ownDevices.forEach(id => targets.push({jid: this.myBareJid, id}));

    const keysByJid = {};    // сгруппировано по получателю <keys jid="..."><key rid=.../></keys>
    const failed = [];
    for(const t of targets){
      try{
        const cipher = await this._ensureSession(t.jid, t.id);
        const enc = await cipher.encrypt(keyAndTag.buffer.slice(keyAndTag.byteOffset, keyAndTag.byteOffset + keyAndTag.byteLength));
        const bodyBytes = omemo._binStrToBytes(enc.body);
        const b64 = B.b64FromBuf(bodyBytes);
        const isPreKey = enc.type === 3;
        const keyXml = `<key rid="${t.id}"${isPreKey ? ' kex="true"' : ''}>${b64}</key>`;
        // XEP-0384 omemo:2 требует группировки ключей по bare JID получателя через
        // <keys jid="...">...</keys> внутри <header>. Без этой обёртки спек-совместимые
        // клиенты (Conversations, Gajim и т.п.) не находят ключ, адресованный им.
        (keysByJid[t.jid] = keysByJid[t.jid] || []).push(keyXml);
      }catch(e){
        console.warn('OMEMO: не удалось зашифровать для устройства', t, e);
        debugLog('шифрование для ' + t.jid + ':' + t.id + ' FAIL: ' + (e && e.message ? e.message : e));
        failed.push(t);
      }
    }
    const headerKeysXml = Object.keys(keysByJid).map(jid => `<keys jid="${jid}">${keysByJid[jid].join('')}</keys>`).join('');
    const gotRecipientKeys = !!(keysByJid[toBareJid] && keysByJid[toBareJid].length > 0);
    if(!gotRecipientKeys){
      // Список устройств собеседника не пуст, но ни на одно из них не
      // получилось установить сессию - скорее всего, все ID мёртвые
      // (протухшие бандлы после сброса хранилища на его стороне).
      // Свои устройства (myBareJid) тут не считаются: их наличие в keysByJid
      // не означает, что сообщение дойдёт до собеседника.
      debugLog('шифрование НЕВОЗМОЖНО для ' + toBareJid + ': все ' + recipientDevices.length + ' устройств(о) недоступны - сообщение уйдёт без OMEMO');
      this.lastEncryptFailReason = 'all-devices-dead';
      return null;
    }
    this.lastEncryptFailReason = null;

    const xml = `<encrypted xmlns="${NS_OMEMO}">` +
      `<header sid="${this.deviceId}">${headerKeysXml}</header>` +
      `<payload>${B.b64FromBuf(payloadBytes)}</payload>` +
      `</encrypted>`;
    return _parseXml(xml);
  },

  // Запоминаем реальный device id собеседника прямо из заголовка входящего
  // сообщения. Это единственный источник истины, который не может устареть - в отличие
  // от PEP-узла, где может годами висеть мёртвый item от давно удалённого/переустановленного
  // клиента (или от теста этим же JID через другой клиент). Вызывается для КАЖДОГО
  // входящего <encrypted>, даже если оно адресовано не нашему устройству.
  _learnIncomingDevice(bareJid, id){
    const rec = this.learnedDevices[bareJid];
    if(!rec){
      this.learnedDevices[bareJid] = {ids: new Set([id])};
    } else if(!rec.ids.has(id)){
      rec.ids.add(id);
      debugLog('learnedDevices: ' + bareJid + ' - новый реальный device id=' + id);
    }
    const learned = this.learnedDevices[bareJid];
    const cached = this.deviceListCache[bareJid];
    const mergedIds = Array.from(new Set([
      ...(cached ? cached.ids : []),
      ...learned.ids
    ]));
    this.deviceListCache[bareJid] = {ids: mergedIds, ts: Date.now(), protocol: 'v2', fresh: true};
    this.chatSupport[bareJid] = true;
  },
});
