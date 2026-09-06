import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { plaintextFallbackDecision: {} },
}));
vi.mock('../../../../src/ui/modals.js', () => ({ confirm: vi.fn() }));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { enabled: true, ready: true, encryptFor: vi.fn(), lastEncryptFailReason: null },
}));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { encryptOrFallback } from '../../../../src/net/messaging/outgoing/encrypt-or-fallback.js';
import { state } from '../../../../src/core/state.js';
import { confirm as confirmModal } from '../../../../src/ui/modals.js';
import { omemo } from '../../../../src/crypto/omemo/state.js';

describe('encryptOrFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.plaintextFallbackDecision = {};
    omemo.enabled = true;
    omemo.ready = true;
    omemo.lastEncryptFailReason = null;
  });

  it('OMEMO включён и шифрование прошло - blocked:false, encryptedEl есть, confirm не спрашивается', async () => {
    const fakeEl = { tagName: 'encrypted' };
    omemo.encryptFor.mockResolvedValue(fakeEl);

    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');

    expect(res).toEqual({ blocked: false, encryptedEl: fakeEl, fallbackReason: null });
    expect(confirmModal).not.toHaveBeenCalled();
  });

  it('OMEMO выключен глобально - уходит открытым текстом без вопросов (fallbackReason:null)', async () => {
    omemo.enabled = false;
    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');
    expect(res).toEqual({ blocked: false, encryptedEl: null, fallbackReason: null });
    expect(omemo.encryptFor).not.toHaveBeenCalled();
    expect(confirmModal).not.toHaveBeenCalled();
  });

  it('encryptFor бросает исключение - трактуется как неудача шифрования, идёт в fallback-ветку', async () => {
    omemo.encryptFor.mockRejectedValue(new Error('boom'));
    confirmModal.mockResolvedValue(true);

    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');

    expect(res.blocked).toBe(false);
    expect(res.encryptedEl).toBe(null);
    expect(confirmModal).toHaveBeenCalledTimes(1);
  });

  it('нет устройств у собеседника, решения ещё не было - спрашивает confirm; ok=true -> allow сохраняется в state', async () => {
    omemo.encryptFor.mockResolvedValue(null);
    confirmModal.mockResolvedValue(true);

    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');

    expect(res).toEqual({ blocked: false, encryptedEl: null, fallbackReason: 'no-devices' });
    expect(state.plaintextFallbackDecision['alice@example.com']).toBe('allow');
  });

  it('confirm отклонён (ok=false) - blocked:true, решение block сохраняется в state', async () => {
    omemo.encryptFor.mockResolvedValue(null);
    confirmModal.mockResolvedValue(false);

    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');

    expect(res.blocked).toBe(true);
    expect(state.plaintextFallbackDecision['alice@example.com']).toBe('block');
  });

  it('ранее сохранённое решение allow для этого чата - повторно confirm не спрашивается', async () => {
    state.plaintextFallbackDecision['alice@example.com'] = 'allow';
    omemo.encryptFor.mockResolvedValue(null);

    const res = await encryptOrFallback('alice@example.com', 'ещё сообщение', 'Сообщение');

    expect(res).toEqual({ blocked: false, encryptedEl: null, fallbackReason: 'no-devices' });
    expect(confirmModal).not.toHaveBeenCalled();
  });

  it('ранее сохранённое решение block для этого чата - сразу blocked:true без confirm', async () => {
    state.plaintextFallbackDecision['alice@example.com'] = 'block';
    omemo.encryptFor.mockResolvedValue(null);

    const res = await encryptOrFallback('alice@example.com', 'ещё сообщение', 'Сообщение');

    expect(res.blocked).toBe(true);
    expect(confirmModal).not.toHaveBeenCalled();
  });

  it('lastEncryptFailReason=all-devices-dead - fallbackReason тоже all-devices-dead', async () => {
    omemo.lastEncryptFailReason = 'all-devices-dead';
    omemo.encryptFor.mockResolvedValue(null);
    confirmModal.mockResolvedValue(true);

    const res = await encryptOrFallback('alice@example.com', 'привет', 'Сообщение');
    expect(res.fallbackReason).toBe('all-devices-dead');
  });

  it('body - ключ вложения (aesgcm://): игнорирует сохранённое allow для чата, всегда спрашивает заново', async () => {
    state.plaintextFallbackDecision['alice@example.com'] = 'allow';
    omemo.encryptFor.mockResolvedValue(null);
    confirmModal.mockResolvedValue(true);

    const res = await encryptOrFallback('alice@example.com', 'aesgcm://host/path#abcd1234', 'Сообщение');

    expect(confirmModal).toHaveBeenCalledTimes(1);
    expect(res.blocked).toBe(false);
  });

  it('body - ключ вложения: после ответа решение НЕ перезаписывает общее plaintextFallbackDecision чата', async () => {
    omemo.encryptFor.mockResolvedValue(null);
    confirmModal.mockResolvedValue(false);

    await encryptOrFallback('bob@example.com', 'aesgcm://host/path#abcd1234', 'Сообщение');

    expect(state.plaintextFallbackDecision['bob@example.com']).toBeUndefined();
  });
});
