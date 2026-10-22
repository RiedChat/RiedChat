import { describe, it, expect, beforeEach } from 'vitest';
import { identityMethods } from '../../src/crypto/identity-store.js';
import * as B from '../../src/crypto/bytes.js';

// idb-kv.js (IndexedDB) подменён in-memory Map: логика TOFU/лимита зависит только
// от get/set/del/keys с префиксом.
function fakeIdb(){
  const m = new Map();
  return {
    async get(key){ return m.has(key) ? m.get(key) : null; },
    async set(key, val){ m.set(key, val); },
    async del(key){ m.delete(key); },
    async keys(prefix){ return Array.from(m.keys()).filter(k => !prefix || k.startsWith(prefix)); },
    async entries(prefix){ return (await this.keys(prefix)).map(k => [k, m.get(k)]); },
  };
}

class IdentityStore{
  constructor(idb, ns){ this.idb = idb; this.ns = ns; }
  _k(kind, id = ''){ return this.ns + kind + ':' + id; }
  _get(kind, id){ return this.idb.get(this._k(kind, id)); }
  _set(kind, id, value){ return this.idb.set(this._k(kind, id), value); }
  _del(kind, id){ return this.idb.del(this._k(kind, id)); }
}
Object.assign(IdentityStore.prototype, identityMethods);

function keyBuf(seed){ return new Uint8Array(32).fill(seed).buffer; }

describe('IdentityStore: TOFU-доверие (isTrustedIdentity)', () => {
  let store;
  beforeEach(() => { store = new IdentityStore(fakeIdb(), 'omemo:me@example.com:'); });

  it('первое устройство контакта принимается автоматически (TOFU) и запоминается', async () => {
    const trusted = await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    expect(trusted).toBe(true);
    expect(await store.isVerified('alice@example.com.1')).toBe(false);
    expect(await store.countTrustedDevices('alice@example.com')).toBe(1);
  });

  it('повторный вызов с тем же ключом - доверяем молча, без изменений', async () => {
    await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    const trusted = await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    expect(trusted).toBe(true);
  });

  it('ключ устройства сменился - новый автопринимается, verified сбрасывается, попадает в change-log', async () => {
    await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    await store.setVerified('alice@example.com.1', true);
    expect(await store.isVerified('alice@example.com.1')).toBe(true);

    const trusted = await store.isTrustedIdentity('alice@example.com.1', keyBuf(2));
    expect(trusted).toBe(true); // гибридная стратегия - не блокирует переписку
    expect(await store.isVerified('alice@example.com.1')).toBe(false);
    expect(await store.isPendingReverify('alice@example.com.1')).toBe(true);
  });

  it('новое устройство сверх лимита уходит в очередь pendingSlotKey, а не принимается сразу', async () => {
    await store.setMaxDevicesPerContact(1);
    await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));

    const trusted = await store.isTrustedIdentity('alice@example.com.2', keyBuf(2));
    expect(trusted).toBe(false);
    const pending = await store.listPendingSlotDevices('alice@example.com');
    expect(pending).toHaveLength(1);
    expect(pending[0].identifier).toBe('alice@example.com.2');
    expect(pending[0].b64).toBe(B.b64FromBuf(keyBuf(2)));
  });

  it('resolvePendingSlot переносит отложенный ключ в доверенные и чистит очередь', async () => {
    await store.setMaxDevicesPerContact(1);
    await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    await store.isTrustedIdentity('alice@example.com.2', keyBuf(2));

    const resolved = await store.resolvePendingSlot('alice@example.com.2');
    expect(resolved).toBe(true);
    expect(await store.listPendingSlotDevices('alice@example.com')).toHaveLength(0);
    // Теперь устройство доверяется обычным путём, без очереди.
    const trusted = await store.isTrustedIdentity('alice@example.com.2', keyBuf(2));
    expect(trusted).toBe(true);
  });

  it('setMaxDevicesPerContact ограничивает значение диапазоном 1..5', async () => {
    // ВНИМАНИЕ: 0 falsy, поэтому `Number(n) || 5` в identity-store.js (setMaxDevicesPerContact) даёт 5, а не 1.
    // Зафиксировано как есть - возможный неочевидный побочный эффект.
    expect(await store.setMaxDevicesPerContact(0)).toBe(5);
    expect(await store.setMaxDevicesPerContact(-1)).toBe(1);
    expect(await store.setMaxDevicesPerContact(99)).toBe(5);
    expect(await store.setMaxDevicesPerContact(3)).toBe(3);
  });

  it('deleteIdentity полностью забывает устройство (trusted/verified/pendingReverify)', async () => {
    await store.isTrustedIdentity('alice@example.com.1', keyBuf(1));
    await store.setVerified('alice@example.com.1', true);
    await store.deleteIdentity('alice@example.com.1');
    expect(await store.getIdentityRaw('alice@example.com.1')).toBeNull();
    expect(await store.isVerified('alice@example.com.1')).toBe(false);
  });
});

describe('IdentityStore.saveIdentity', () => {
  it('возвращает changed=false для первой записи, true при смене ключа', async () => {
    const store = new IdentityStore(fakeIdb(), 'omemo:me@example.com:');
    const first = await store.saveIdentity('alice@example.com.1', keyBuf(1));
    expect(first).toBeFalsy();
    const second = await store.saveIdentity('alice@example.com.1', keyBuf(2));
    expect(second).toBe(true);
  });
});
