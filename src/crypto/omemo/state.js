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
// Ниже этого остатка одноразовых prekeys - пора догенерировать новые (см.
// replenishPreKeysIfNeeded ниже).
const PREKEY_REFILL_THRESHOLD = 20;

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
        // Продолжающийся счётчик id для будущих пополнений (см.
        // replenishPreKeysIfNeeded) - следующая догенерация должна начинаться
        // с PREKEY_COUNT+1, а не снова с 1, иначе новый ключ переиспользовал
        // бы id уже когда-то опубликованного (и потенциально ещё не
        // израсходованного) prekey.
        await this.store.setMeta('nextPreKeyId', PREKEY_COUNT + 1);
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

    // Одноразовые prekeys - исчерпаемый ресурс: каждая новая X3DH-сессия,
    // которую с нами устанавливает собеседник, тратит один ключ (libsignal
    // сам удаляет его из хранилища - см. removePreKey в crypto/prekey-store.js
    // и decrypt.js), а пополнения раньше не было вообще. После PREKEY_COUNT
    // входящих key-exchange'ей бандл на сервере оставался бы с пустым
    // <prekeys/>, и НИКТО новый (новый контакт, новое устройство контакта)
    // больше не смог бы инициировать с нами сессию - деградация X3DH вплоть
    // до целевого DoS (достаточно самому наинициировать с жертвой
    // PREKEY_COUNT сессий, например открыв и закрыв чат с разных подставных
    // JID). Проверяем остаток при каждой инициализации (плюс сразу после
    // расхода ключа - см. decrypt.js) и при необходимости догоняем до
    // PREKEY_COUNT, публикуя bundle заново.
    await this.replenishPreKeysIfNeeded();

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

  // Догоняет запас одноразовых prekeys до PREKEY_COUNT, если он упал ниже
  // PREKEY_REFILL_THRESHOLD. Сам bundle НЕ перепубликовывает - это решает
  // вызывающий код: init() и так публикует bundle следующим шагом, а
  // decrypt.js (расход ключа посреди сессии) публикует явно сам, только
  // если реально было что публиковать (возвращаем true/false).
  async replenishPreKeysIfNeeded(){
    if(!this.store) return false;
    const remaining = await this.store.countPreKeys();
    if(remaining >= PREKEY_REFILL_THRESHOLD) return false;
    const storedNextId = await this.store.getMeta('nextPreKeyId');
    const startId = storedNextId || ((await this.store.maxPreKeyId()) + 1);
    const toGenerate = PREKEY_COUNT - remaining;
    await this._generatePreKeys(startId, toGenerate);
    await this.store.setMeta('nextPreKeyId', startId + toGenerate);
    debugLog('OMEMO: пополнил one-time prekeys (было ' + remaining + ', догенерировал ' + toGenerate + ', id ' + startId + '..' + (startId + toGenerate - 1) + ')');
    return true;
  },
};
