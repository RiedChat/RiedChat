import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { connection: null },
}));
vi.mock('../../../../src/core/uuid.js', () => ({ uuid: () => 'fixed-uuid' }));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { enabled: true, ready: true, encryptFor: vi.fn(), lastEncryptFailReason: null },
}));

import { sendCallSignal } from '../../../../src/net/messaging/outgoing/call-signal.js';
import { state } from '../../../../src/core/state.js';
import { omemo } from '../../../../src/crypto/omemo/state.js';

function fakeBuilder(){
  const calls = [];
  const node = {
    c: (name, attrs) => { calls.push(['c', name, attrs]); return node; },
    cnode: (el) => { calls.push(['cnode', el]); return node; },
    up: () => node,
  };
  return { node, calls };
}

describe('sendCallSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connection = { send: vi.fn() };
    omemo.enabled = true;
    omemo.ready = true;
    omemo.lastEncryptFailReason = null;
    global.Strophe = { getBareJidFromJid: (jid) => jid.split('/')[0] };
  });

  it('OMEMO не готов - сразу sent:false, reason:omemo-unavailable, шифрование не пробуется', async () => {
    omemo.ready = false;
    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });
    expect(res).toEqual({ sent: false, reason: 'omemo-unavailable' });
    expect(omemo.encryptFor).not.toHaveBeenCalled();
  });

  it('шифрует по bare JID адресата, даже если to - полный JID с ресурсом', async () => {
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    omemo.encryptFor.mockResolvedValue({ tagName: 'encrypted' });

    await sendCallSignal('alice@example.com/phone', 'offer', 'call-1', { sdp: 'x' });

    expect(omemo.encryptFor).toHaveBeenCalledWith('alice@example.com', JSON.stringify({ sdp: 'x' }));
  });

  it('успешная отправка: станза содержит call-signal с type/id, cnode(encryptedEl) и no-store; sent:true', async () => {
    const { node, calls } = fakeBuilder();
    global.$msg = vi.fn((attrs) => { calls.push(['$msg', attrs]); return node; });
    const encryptedEl = { tagName: 'encrypted' };
    omemo.encryptFor.mockResolvedValue(encryptedEl);

    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });

    expect(res).toEqual({ sent: true });
    expect(calls).toContainEqual(['$msg', { to: 'alice@example.com', type: 'chat', id: 'fixed-uuid' }]);
    expect(calls).toContainEqual(['c', 'call-signal', { xmlns: 'riedchat:call:0', type: 'offer', id: 'call-1' }]);
    expect(calls).toContainEqual(['cnode', encryptedEl]);
    expect(calls).toContainEqual(['c', 'no-store', { xmlns: 'urn:xmpp:hints' }]);
    expect(state.connection.send).toHaveBeenCalledWith(node);
  });

  it('encryptFor бросает исключение - sent:false, reason:send-error, ничего не отправляется', async () => {
    omemo.encryptFor.mockRejectedValue(new Error('crypto fail'));
    global.$msg = vi.fn();

    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });

    expect(res).toEqual({ sent: false, reason: 'send-error' });
    expect(global.$msg).not.toHaveBeenCalled();
    expect(state.connection.send).not.toHaveBeenCalled();
  });

  it('encryptFor вернул null (нет устройств) - sent:false, reason:no-devices, станза не строится', async () => {
    omemo.encryptFor.mockResolvedValue(null);
    global.$msg = vi.fn();

    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });

    expect(res).toEqual({ sent: false, reason: 'no-devices' });
    expect(global.$msg).not.toHaveBeenCalled();
  });

  it('encryptFor вернул null при lastEncryptFailReason=all-devices-dead - reason:all-devices-dead', async () => {
    omemo.lastEncryptFailReason = 'all-devices-dead';
    omemo.encryptFor.mockResolvedValue(null);

    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });
    expect(res).toEqual({ sent: false, reason: 'all-devices-dead' });
  });

  it('connection.send бросает исключение - sent:false, reason:send-error (не падает наружу)', async () => {
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    omemo.encryptFor.mockResolvedValue({ tagName: 'encrypted' });
    state.connection.send = vi.fn(() => { throw new Error('socket closed'); });

    const res = await sendCallSignal('alice@example.com', 'offer', 'call-1', { sdp: 'x' });
    expect(res).toEqual({ sent: false, reason: 'send-error' });
  });

  it('payload=null (decline/hangup/busy) - шифрует пустой JSON-объект', async () => {
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    omemo.encryptFor.mockResolvedValue({ tagName: 'encrypted' });

    await sendCallSignal('alice@example.com', 'hangup', 'call-1', null);

    expect(omemo.encryptFor).toHaveBeenCalledWith('alice@example.com', '{}');
  });
});
