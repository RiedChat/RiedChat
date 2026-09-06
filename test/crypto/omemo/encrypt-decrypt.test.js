import { describe, it, expect, vi, beforeEach } from 'vitest';

// НЕ РЕАЛИЗОВАНО: полный round-trip encryptFor(Alice) → decryptStanza(Bob).
// Причина - не в коде проекта, а в public/js/crypto/libsignal-protocol.js
// (generated emscripten/asm.js-бандл, см. README.md): в headless Node/jsdom
// V8 не компилирует его как настоящий asm.js ("Invalid asm.js: Expected
// shift of word size" в логе) и молча деградирует в обычный JS-интерпретатор,
// после чего SessionCipher.encrypt() на первом же X3DH-хендшейке падает с
// "Tried to convert a non-string of type object to an array buffer" -
// воспроизведено даже на чистом in-memory SignalProtocolStore без всякого
// кода этого проекта, т.е. баг воспроизводится и без store.js/omemo/*.js.
// В реальном браузере (для чего библиотека и написана) всё работает -
// это подтверждено самим приложением.
// Если понадобится закрыть именно этот сценарий тестами - единственный
// вариант вернуться к нему уже не через jsdom, а через настоящий браузерный
// движок (vitest --browser или Playwright), не через vitest+jsdom.
//
// Ниже - то, что реально тестируется headless: getDeviceList/session-builder
// корректно обрабатывают отсутствие bundle получателя (encryptFor должен
// НЕ отправлять сообщение без OMEMO, а не падать и не молчать).

vi.mock('../../../src/crypto/omemo-vault.js', async (importOriginal) => {
  const actual = await importOriginal();
  const keys = new Map();
  return {
    ...actual,
    async getOmemoStorageKey(bareJid){
      if(!keys.has(bareJid)){
        keys.set(bareJid, await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']));
      }
      return keys.get(bareJid);
    },
  };
});

import { omemo } from '../../../src/crypto/omemo/state.js';
import '../../../src/crypto/omemo/device-list-discovery.js';
import '../../../src/crypto/omemo/session-builder.js';
import '../../../src/crypto/omemo/encrypt.js';
import '../../../src/crypto/omemo/decrypt.js';
import '../../../src/crypto/omemo/bundle.js';
import '../../../src/crypto/omemo/envelope.js';
import { createSignalStore } from '../../../src/crypto/store.js';

function makeDevice(bareJid){
  return Object.create(omemo, {
    myBareJid: {value: bareJid, writable: true},
    deviceListCache: {value: {}, writable: true},
    learnedDevices: {value: {}, writable: true},
    sessionCipherCache: {value: {}, writable: true},
    chatSupport: {value: {}, writable: true},
    ready: {value: false, writable: true},
  });
}

async function setupIdentity(device){
  device.store = await createSignalStore(device.myBareJid);
  const idKeyPair = await libsignal.KeyHelper.generateIdentityKeyPair();
  const regId = libsignal.KeyHelper.generateRegistrationId();
  const deviceId = regId;
  await device.store.setIdentityKeyPair(idKeyPair);
  await device.store.setLocalRegistrationId(regId);
  await device.store.setDeviceId(deviceId);
  await device._generatePreKeys(1, 5);
  await device._generateSignedPreKey(idKeyPair, 1);
  device.deviceId = deviceId;
  device.registrationId = regId;
  device.identityKeyPair = idKeyPair;
  device.ready = true;
}

describe('OMEMO encryptFor - устройство без опубликованного bundle', () => {
  let alice;

  beforeEach(async () => {
    alice = makeDevice('alice@example.com');
    await setupIdentity(alice);
    window.$iq = (attrs) => {
      const path = [attrs];
      const builder = { c(name, cattrs){ path.push({name, attrs: cattrs}); return builder; }, _path: path };
      return builder;
    };
    // Ни один запрос bundle не отвечает успехом - имитация мёртвого/
    // отсутствующего PEP-узла собеседника.
    alice.connection = { sendIQ(_iq, _onSuccess, onError){ onError(null); } };
  });

  it('не отправляет сообщение без OMEMO, если bundle получателя недоступен', async () => {
    const stranger = makeDevice('stranger@example.com');
    await setupIdentity(stranger);
    alice.deviceListCache[stranger.myBareJid] = {ids: [stranger.deviceId], ts: Date.now(), fresh: true};

    const result = await alice.encryptFor(stranger.myBareJid, 'x');

    expect(result).toBeNull();
    expect(alice.lastEncryptFailReason).toBe('all-devices-dead');
  });

  it('без устройств у получателя (пустой device-list) тоже возвращает null', async () => {
    alice.deviceListCache['nobody@example.com'] = {ids: [], ts: Date.now(), fresh: true};
    const result = await alice.encryptFor('nobody@example.com', 'x');
    expect(result).toBeNull();
  });
});
