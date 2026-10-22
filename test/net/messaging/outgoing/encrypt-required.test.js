import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/dom-utils.js', () => ({ toast: vi.fn() }));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: {
    ready: true, encryptFor: vi.fn(), lastEncryptFailReason: null,
    encryptFailReason(){ return this.lastEncryptFailReason === 'all-devices-dead' ? 'all-devices-dead' : 'no-devices'; },
  },
}));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { encryptRequired, notifyNotSent } from '../../../../src/net/messaging/outgoing/encrypt-required.js';
import { toast } from '../../../../src/core/dom-utils.js';
import { omemo } from '../../../../src/crypto/omemo/state.js';

describe('encryptRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    omemo.ready = true;
    omemo.lastEncryptFailReason = null;
  });

  it('шифрование прошло - encryptedEl есть, reason:null, тоста нет', async () => {
    const fakeEl = { tagName: 'encrypted' };
    omemo.encryptFor.mockResolvedValue(fakeEl);

    const res = await encryptRequired('alice@example.com', 'привет');

    expect(res).toEqual({ encryptedEl: fakeEl, reason: null });
    expect(omemo.encryptFor).toHaveBeenCalledWith('alice@example.com', 'привет');
    expect(toast).not.toHaveBeenCalled();
  });

  it('OMEMO не готов - encryptedEl:null, reason:omemo-unavailable, encryptFor не вызывается, тост показан', async () => {
    omemo.ready = false;

    const res = await encryptRequired('alice@example.com', 'привет');

    expect(res).toEqual({ encryptedEl: null, reason: 'omemo-unavailable' });
    expect(omemo.encryptFor).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('messaging.notSentUnavailable');
  });

  it('encryptFor вернул null (нет устройств) - reason:no-devices и тост', async () => {
    omemo.encryptFor.mockResolvedValue(null);

    const res = await encryptRequired('alice@example.com', 'привет');

    expect(res).toEqual({ encryptedEl: null, reason: 'no-devices' });
    expect(toast).toHaveBeenCalledWith('messaging.notSentNoDevices');
  });

  it('encryptFor вернул null, все сессии мертвы - reason:all-devices-dead и свой тост', async () => {
    omemo.encryptFor.mockResolvedValue(null);
    omemo.lastEncryptFailReason = 'all-devices-dead';

    const res = await encryptRequired('alice@example.com', 'привет');

    expect(res).toEqual({ encryptedEl: null, reason: 'all-devices-dead' });
    expect(toast).toHaveBeenCalledWith('messaging.notSentNoSession');
  });

  it('encryptFor бросил исключение - не пробрасывается, итог как при неудаче шифрования', async () => {
    omemo.encryptFor.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await encryptRequired('alice@example.com', 'привет');

    expect(res.encryptedEl).toBeNull();
    expect(res.reason).toBe('no-devices');
    expect(toast).toHaveBeenCalledWith('messaging.notSentNoDevices');
    warn.mockRestore();
  });
});

describe('notifyNotSent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('неизвестная причина - тост как для no-devices, а не пустой', () => {
    notifyNotSent('something-else');
    expect(toast).toHaveBeenCalledWith('messaging.notSentNoDevices');
  });
});
