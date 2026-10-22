// ===================== crypto/omemo/state.js =====================
// Состояние OMEMO (XEP-0384, urn:xmpp:omemo:2) и init() поверх libsignal-protocol.js.
//
// Нюансы:
//  - libsignal-protocol.js официально не поддерживается (Signal перешёл на libsignal-client),
//    протокол (X3DH + Double Ratchet) не меняется.
//  - Доверие по TOFU: identity-key нового устройства запоминается автоматически. Без ручной сверки
//    отпечатков (кнопка с замком в шапке чата) защита от активного MITM неполная; пассивный перехват бессилен.
//  - Нужен XMPP-сервер с PEP (XEP-0163).
//
// Создаёт omemo с базовым состоянием и init(). Остальные методы примешиваются из omemo/*.js
// через Object.assign(omemo, {...}); порядок подключения в src/main.js важен: этот файл первым.
import { debugLog, errMsg } from '../../core/debug-log.js';
import { toast } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';
import * as B from '../bytes.js';
import { createSignalStore } from '../store.js';

const PREKEY_COUNT = 100;
// Ниже этого остатка одноразовых prekeys догенерируем новые (replenishPreKeysIfNeeded).
const PREKEY_REFILL_THRESHOLD = 20;
// Не перепубликуем device-list/bundle чаще этого интервала при переподключениях.
const PUBLISH_MIN_INTERVAL_MS = 10 * 60 * 1000;

export const omemo = {
  store: null,
  deviceId: null,
  registrationId: null,
  myBareJid: '',
  deviceListCache: {},   // bareJid -> {ids:[...], ts, fresh, confirmed?}
  ignoredDevices: {},    // bareJid -> Set(id): устройства, которые пользователь «забыл» (см. trust.js:forgetDevice)
  learnedDevices: {},    // bareJid -> {ids:Set}: виденные во входящих sid, приоритетнее PEP (см. getDeviceList)
  sessionCipherCache: {},// "jid:deviceId" -> SessionCipher
  chatSupport: {},       // bareJid -> true/false/undefined (есть ли OMEMO-устройства)
  ready: false,

  // Причина, по которой encryptFor() не вернул шифртекст: 'all-devices-dead' или 'no-devices'
  // (omemo/encrypt.js: lastEncryptFailReason).
  encryptFailReason(){
    return this.lastEncryptFailReason === 'all-devices-dead' ? 'all-devices-dead' : 'no-devices';
  },

  // ---------- инициализация ----------
  // Вызовы init() ставятся в очередь: при переподключении (resilience.js) старая и новая onLoggedIn могли идти параллельно,
  // обе видели пустое хранилище и генерировали РАЗНЫЕ deviceId - в device-list копились дубли одного устройства.
  init(connection, myBareJid){
    const run = () => this._initOnce(connection, myBareJid);
    this._initQueue = (this._initQueue || Promise.resolve()).then(run, run);
    return this._initQueue;
  },

  async _initOnce(connection, myBareJid){
    // crypto.subtle доступен только в безопасном контексте (https:// или localhost);
    // иначе генерация ключей молча ломается - проверяем явно.
    if(!window.crypto?.subtle){
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
      // Хранилище и ключи уже подняты для этого аккаунта (переподключение) - не открываем базу заново.
      const sameAccount = this.ready && this.store && this.myBareJid === myBareJid && this.deviceId;
      this.myBareJid = myBareJid;
      if(!sameAccount) this.store = await createSignalStore(myBareJid);
      if(!sameAccount) await this._loadIgnoredDevices();

      let idKeyPair = await this.store.getIdentityKeyPair();
      let regId = await this.store.getLocalRegistrationId();
      let deviceId = await this.store.getDeviceId();

      if(!idKeyPair || regId == null || deviceId == null){
        idKeyPair = await libsignal.KeyHelper.generateIdentityKeyPair();
        do{ regId = libsignal.KeyHelper.generateRegistrationId(); }while(!regId);
        deviceId = regId; // используем как id устройства
        await this.store.setIdentityKeyPair(idKeyPair);
        await this.store.setLocalRegistrationId(regId);
        await this.store.setDeviceId(deviceId);
        // Одноразовые prekeys генерирует replenishPreKeysIfNeeded() ниже (с id 1, выставляет nextPreKeyId).
        await this._generateSignedPreKey(idKeyPair, 1);
      }

      this.deviceId = deviceId;
      this.registrationId = regId;
      this.identityKeyPair = idKeyPair;
      this.ready = true;
      debugLog('init OK: myDeviceId=' + deviceId + ' regId=' + regId);
    }catch(e){
      console.error('OMEMO: критическая ошибка инициализации ключей', e);
      toast(t('omemo.keyInitError', {detail: errMsg(e)}));
      this.ready = false;
      return;
    }

    // Одноразовые prekeys исчерпаемы: каждая входящая X3DH-сессия тратит один (libsignal удаляет сам,
    // см. prekey-store.js, decrypt.js). При пустом <prekeys/> никто новый не сможет начать сессию -
    // деградация X3DH вплоть до целевого DoS. Проверяем остаток при init и после расхода ключа (decrypt.js),
    // при необходимости догоняем до PREKEY_COUNT и перепубликуем bundle.
    const replenished = await this.replenishPreKeysIfNeeded();

    // Публикация переживает переподключение (device-list и bundle лежат на сервере): повторяем её только при
    // новых prekeys или если прошлая успешная публикация этого deviceId была давно. Иначе каждый реконнект
    // слал десятки одинаковых запросов (fetch всех bundle для prune + publish device-list + publish bundle с 100 prekeys).
    const key = myBareJid + ':' + this.deviceId;
    const recent = this._publishedKey === key && (Date.now() - (this._publishedAt || 0)) < PUBLISH_MIN_INTERVAL_MS;
    if(recent && !replenished){
      debugLog('publish SKIP: device-list + bundle уже опубликованы недавно для ' + key);
      return;
    }

    try{
      await this._publishDeviceList();
      await this._publishBundle();
      this._publishedKey = key;
      this._publishedAt = Date.now();
      debugLog('publish OK: device-list + bundle (omemo:2) опубликованы на ' + this.myBareJid);
    }catch(e){
      console.warn('OMEMO: не удалось опубликовать bundle/device-list', e);
      debugLog('publish FAIL: ' + errMsg(e) + (e && e.node ? (' | ' + new XMLSerializer().serializeToString(e.node)) : ''));
      toast(t('omemo.publishFailed', {detail: errMsg(e)}));
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

  // Догоняет prekeys до PREKEY_COUNT, если остаток ниже PREKEY_REFILL_THRESHOLD.
  // Bundle не публикует - решает вызывающий: init() публикует следующим шагом, decrypt.js явно,
  // если вернулось true.
  // Одновременные вызовы (несколько prekey-сообщений подряд) делят один проход: иначе оба читали один nextPreKeyId
  // и генерировали одни и те же id, а bundle публиковался по разу на каждый.
  replenishPreKeysIfNeeded(){
    if(!this._replenishP){
      this._replenishP = this._replenishOnce().finally(() => { this._replenishP = null; });
    }
    return this._replenishP;
  },
  async _replenishOnce(){
    if(!this.store) return false;
    // Не чаще раза в 30 с: каждое prekey-сообщение собеседника (он шлёт kex=true, пока мы не ответим) дёргает проверку.
    if(Date.now() - (this._replenishAt || 0) < 30 * 1000) return false;
    const remaining = await this.store.countPreKeys();
    if(remaining >= PREKEY_REFILL_THRESHOLD) return false;
    this._replenishAt = Date.now();
    const maxId = await this.store.maxPreKeyId();
    // Number(): нечисловой nextPreKeyId давал строковую склейку id; Math.max: новый id не должен затирать существующие.
    const startId = Math.max(Number(await this.store.getMeta('nextPreKeyId')) || 0, maxId + 1);
    const toGenerate = Math.max(0, PREKEY_COUNT - remaining);
    for(let i = 0; i < toGenerate; i++){
      const pk = await libsignal.KeyHelper.generatePreKey(startId + i);
      await this.store.storePreKey(pk.keyId, pk.keyPair);
      // Отдаём event loop каждые 10 ключей: генерация на главном потоке иначе замораживает UI.
      if(i % 10 === 9) await new Promise(r => setTimeout(r, 0));
    }
    await this.store.setMeta('nextPreKeyId', startId + toGenerate);
    const after = await this.store.countPreKeys();
    debugLog('OMEMO: пополнил one-time prekeys (было ' + remaining + ', догенерировал ' + toGenerate + ', id ' + startId + '..' + (startId + toGenerate - 1) + ', стало ' + after + ')');
    return true;
  },
};
