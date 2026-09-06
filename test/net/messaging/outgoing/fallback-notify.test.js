import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/dom-utils.js', () => ({ toast: vi.fn() }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { notifyEncryptionFallback } from '../../../../src/net/messaging/outgoing/fallback-notify.js';
import { toast } from '../../../../src/core/dom-utils.js';

describe('notifyEncryptionFallback', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('all-devices-dead - toast с ключом fallbackNoSession', () => {
    notifyEncryptionFallback('all-devices-dead');
    expect(toast).toHaveBeenCalledWith('messaging.fallbackNoSession');
  });

  it('no-devices - toast с ключом fallbackNoDevices', () => {
    notifyEncryptionFallback('no-devices');
    expect(toast).toHaveBeenCalledWith('messaging.fallbackNoDevices');
  });

  it('null (сообщение ушло зашифрованным) - toast не вызывается', () => {
    notifyEncryptionFallback(null);
    expect(toast).not.toHaveBeenCalled();
  });

  it('неизвестная причина - toast не вызывается (fail-safe: молчим, а не пугаем зря)', () => {
    notifyEncryptionFallback('something-else');
    expect(toast).not.toHaveBeenCalled();
  });
});
