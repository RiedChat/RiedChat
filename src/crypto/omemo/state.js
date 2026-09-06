// ===================== crypto/omemo/state.js =====================
// Состояние OMEMO (XEP-0384, urn:xmpp:omemo:2) и его инициализация
// поверх libsignal-protocol.js.
//
// ВАЖНО (честно предупреждаю):
//  - Используется библиотека libsignal-protocol.js (та же, на которой десятилетиями
//    работал OMEMO-плагин Converse.js/JSXC). Она официально не поддерживается автором
//    (Signal перешёл на libsignal-client), но криптографический протокол (X3DH +
//    Double Ratchet) от этого не меняется, и реализация остаётся рабочей.
//  - Доверие ключам собеседника здесь работает по модели TOFU (Trust On First Use):
//    при первом сообщении от нового устройства его identity-key запоминается
//    автоматически и считается доверенным. Реальную сверку "отпечатков" (fingerprint)
//    нужно делать вручную через кнопку с замком в шапке чата - сравнить цифры лично
//    или по другому каналу. Без этого шага защита от активного MITM неполная,
//    хотя пассивный перехват трафика (сервер, провайдер) всё равно бессилен.
//  - Для работы нужен XMPP-сервер с поддержкой PEP (XEP-0163) - почти все современные
//    (Prosody, ejabberd, Openfire с плагином) её имеют "из коробки".
//
// Этот файл создаёт omemo с базовым состоянием и init(). Остальные методы
// (публикация ключей, получение чужих ключей, шифрование/расшифровка, доверие)
// примешиваются к этому же объекту из соседних файлов omemo/*.js (через
// Object.assign(omemo, {...}) - см. импорты { omemo } из этого файла) -
// порядок подключения в src/main.js важен: этот файл должен идти первым.
import { bytes as B } from '../bytes.js';
import { toast } from '../../core/dom-utils.js';
import { createSignalStore } from '../store.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

const PREKEY_COUNT = 100;

export const omemo = {
  enabled: true,        // глобальный тумблер - можно временно выключить и слать в открытую
  store: null,
  deviceId: null,
  registrationId: null,
  myBareJid: '',
  deviceListCache: {},   // bareJid -> {ids:[...], ts, protocol}
  learnedDevices: {},    // bareJid -> {ids:Set} - то, что реально видели во входящих sid,
                          // приоритетнее PEP-узла, если тот врёт/устарел (см. getDeviceList)
  sessionCipherCache: {},// "jid:deviceId" -> SessionCipher
  chatSupport: {},       // bareJid -> true/false/undefined (есть ли OMEMO-устройства)
  ready: false,

  // ---------- инициализация ----------
  async init(connection, myBareJid){
    // libsignal-protocol.js использует Web Crypto API (crypto.subtle), который
    // браузер отдаёт ТОЛЬКО в безопасном контексте (https:// или localhost).
    // На file:// или обычном http:// crypto.subtle будет undefined, и всё
    // молча ломается на генерации ключей - поэтому проверяем это явно.
    if(!window.isSecureContext || !window.crypto || !window.crypto.subtle){
      console.error('OMEMO: crypto.subtle недоступен - страница открыта не в безопасном контексте.');
      toast(t('omemo.insecureContext'));
      this.ready = false;
      return;
    }
    if(typeof libsignal === 'undefined'){
      console.error('OMEMO: глобальный объект libsignal не найден - библиотека с CDN не загрузилась.');
      toast(t('omemo.libraryNotLoaded'));
      this.ready = false;
      return;
    }

    try{
      this.connection = connection;
      this.myBareJid = myBareJid;
      this.store = await createSignalStore(myBareJid);

      let idKeyPair = await this.store.getIdentityKeyPair();
      let regId = await this.store.getLocalRegistrationId();
      let deviceId = await this.store.getDeviceId();

      if(!idKeyPair || !regId || !deviceId){
        idKeyPair = await libsignal.KeyHelper.generateIdentityKeyPair();
        regId = libsignal.KeyHelper.generateRegistrationId();
        deviceId = regId; // используем как id устройства
        await this.store.setIdentityKeyPair(idKeyPair);
        await this.store.setLocalRegistrationId(regId);
        await this.store.setDeviceId(deviceId);
        await this._generatePreKeys(1, PREKEY_COUNT);
        await this._generateSignedPreKey(idKeyPair, 1);
      }

      this.deviceId = deviceId;
      this.registrationId = regId;
      this.identityKeyPair = idKeyPair;
      this.ready = true;
      debugLog('init OK: myDeviceId=' + deviceId + ' regId=' + regId);
    }catch(e){
      console.error('OMEMO: критическая ошибка инициализации ключей', e);
      toast(t('omemo.keyInitError', {detail: e && e.message ? e.message : e}));
      this.ready = false;
      return;
    }

    try{
      await this._publishDeviceList();
      await this._publishBundle();
      debugLog('publish OK: device-list + bundle (omemo:2) опубликованы на ' + this.myBareJid);
    }catch(e){
      console.warn('OMEMO: не удалось опубликовать bundle/device-list', e);
      debugLog('publish FAIL: ' + (e && e.message ? e.message : e) + (e && e.node ? (' | ' + new XMLSerializer().serializeToString(e.node)) : ''));
      toast(t('omemo.publishFailed', {detail: e && e.message ? e.message : e}));
    }
  },

  async _generatePreKeys(startId, count){
    for(let i=0;i<count;i++){
      const pk = await libsignal.KeyHelper.generatePreKey(startId + i);
      await this.store.storePreKey(pk.keyId, pk.keyPair);
    }
  },
  async _generateSignedPreKey(idKeyPair, keyId){
    const spk = await libsignal.KeyHelper.generateSignedPreKey(idKeyPair, keyId);
    await this.store.storeSignedPreKey(spk.keyId, spk.keyPair);
    await this.store.setMeta('signedPreKeyId', spk.keyId);
    await this.store.setMeta('signedPreKeySignature', B.b64FromBuf(spk.signature));
    return spk;
  },
};
