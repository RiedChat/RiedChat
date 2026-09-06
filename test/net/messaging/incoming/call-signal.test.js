import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com', myResource: 'desktop' },
}));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { decryptStanza: vi.fn() },
}));
vi.mock('../../../../src/features/call/call-manager.js', () => ({
  callManager: { onSignal: vi.fn() },
}));

import { handleCallSignal } from '../../../../src/net/messaging/incoming/call-signal.js';
import { omemo } from '../../../../src/crypto/omemo/state.js';
import { callManager } from '../../../../src/features/call/call-manager.js';

function fakeStanza({ type = 'offer', id = 'call-1', from = 'alice@example.com/phone', hasEncrypted = true } = {}){
  return {
    getAttribute: (attr) => (attr === 'from' ? from : null),
    querySelector: (sel) => {
      if(sel === 'call-signal') return { getAttribute: (a) => ({ type, id }[a]) };
      if(sel === 'encrypted') return hasEncrypted ? { tagName: 'encrypted' } : null;
      return null;
    },
  };
}

describe('handleCallSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Strophe = { getResourceFromJid: (jid) => (jid && jid.includes('/') ? jid.split('/')[1] : null) };
  });

  it('без type или id в <call-signal> - молча выходит, ничего не расшифровывает', async () => {
    await handleCallSignal(fakeStanza({ type: null }), 'alice@example.com');
    expect(omemo.decryptStanza).not.toHaveBeenCalled();

    await handleCallSignal(fakeStanza({ id: null }), 'alice@example.com');
    expect(omemo.decryptStanza).not.toHaveBeenCalled();
  });

  it('сигнал якобы от собственного bare JID, но без ресурса - отбрасывается (защита от подмены/эха)', async () => {
    await handleCallSignal(fakeStanza({ from: 'me@example.com' }), 'me@example.com');
    expect(omemo.decryptStanza).not.toHaveBeenCalled();
  });

  it('сигнал от собственного bare JID с нашим же текущим ресурсом - отбрасывается как эхо', async () => {
    await handleCallSignal(fakeStanza({ from: 'me@example.com/desktop' }), 'me@example.com');
    expect(omemo.decryptStanza).not.toHaveBeenCalled();
  });

  it('сигнал от собственного bare JID, но с ДРУГИМ ресурсом (звонок себе с другого устройства) - обрабатывается', async () => {
    omemo.decryptStanza.mockResolvedValue(JSON.stringify({ sdp: 'x' }));
    await handleCallSignal(fakeStanza({ from: 'me@example.com/mobile' }), 'me@example.com');
    expect(omemo.decryptStanza).toHaveBeenCalled();
    expect(callManager.onSignal).toHaveBeenCalledWith('me@example.com/mobile', 'me@example.com', 'offer', 'call-1', { sdp: 'x' });
  });

  it('без <encrypted> в станзе - отбрасывается, plaintext-фоллбека для звонков нет', async () => {
    await handleCallSignal(fakeStanza({ hasEncrypted: false }), 'alice@example.com');
    expect(omemo.decryptStanza).not.toHaveBeenCalled();
    expect(callManager.onSignal).not.toHaveBeenCalled();
  });

  it('decryptStanza вернул null (конверт адресован другому нашему устройству) - тихо выходит', async () => {
    omemo.decryptStanza.mockResolvedValue(null);
    await handleCallSignal(fakeStanza(), 'alice@example.com');
    expect(callManager.onSignal).not.toHaveBeenCalled();
  });

  it('decryptStanza бросил исключение (битый payload) - не падает, callManager не вызывается', async () => {
    omemo.decryptStanza.mockRejectedValue(new Error('decrypt fail'));
    await expect(handleCallSignal(fakeStanza(), 'alice@example.com')).resolves.toBeUndefined();
    expect(callManager.onSignal).not.toHaveBeenCalled();
  });

  it('успешная расшифровка: JSON.parse’ит payload и зовёт callManager.onSignal с fromJid (полным) и bare', async () => {
    omemo.decryptStanza.mockResolvedValue(JSON.stringify({ candidate: 'c1' }));
    await handleCallSignal(fakeStanza({ from: 'alice@example.com/phone', type: 'candidate', id: 'call-9' }), 'alice@example.com');

    expect(callManager.onSignal).toHaveBeenCalledWith(
      'alice@example.com/phone', 'alice@example.com', 'candidate', 'call-9', { candidate: 'c1' }
    );
  });

  it('decryptStanza вернул пустую строку (decline/hangup без payload) - передаёт {} вместо null', async () => {
    omemo.decryptStanza.mockResolvedValue('');
    await handleCallSignal(fakeStanza({ type: 'hangup' }), 'alice@example.com');
    expect(callManager.onSignal).toHaveBeenCalledWith(expect.any(String), 'alice@example.com', 'hangup', 'call-1', {});
  });
});
