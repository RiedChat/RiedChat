import { describe, it, expect, vi, beforeEach } from 'vitest';

// handleIncomingMessage тянет за собой state/omemo/history/roster/render -
// мокаем все побочные модули, оставляя только логику самой функции.
vi.mock('../../../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com', roster: {}, messages: {} },
}));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { lastDecryptFailReason: null, lastDecryptFailBareJid: null },
}));
vi.mock('../../../../src/net/message-body-parser.js', () => ({
  parseMessageBody: vi.fn(),
}));
vi.mock('../../../../src/net/messaging/outgoing.js', () => ({
  sendDisplayedMarker: vi.fn(),
}));
vi.mock('../../../../src/ui/roster.js', () => ({ renderRoster: vi.fn() }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ bumpContactMessageCount: vi.fn() }));
vi.mock('../../../../src/core/dom-utils.js', () => ({ toast: vi.fn(), nickOf: (j) => j }));
vi.mock('../../../../src/core/uuid.js', () => ({ uuid: () => 'fixed-uuid' }));
vi.mock('../../../../src/core/debug-log.js', () => ({ debugLog: vi.fn() }));
vi.mock('../../../../src/net/history.js', () => ({ history: { save: vi.fn() } }));

import { handleIncomingMessage } from '../../../../src/net/messaging/incoming/message-handler.js';
import { parseMessageBody } from '../../../../src/net/message-body-parser.js';
import { toast } from '../../../../src/core/dom-utils.js';

function fakeStanza({ from = 'alice@example.com', encrypted = false, body = true } = {}){
  return {
    getAttribute: () => from,
    querySelector: (sel) => (sel === 'encrypted' ? encrypted : body),
  };
}

describe('handleIncomingMessage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('игнорирует сообщение самому себе без <encrypted> (возвращает true, не парсит тело)', async () => {
    const result = await handleIncomingMessage(fakeStanza({ from: 'me@example.com' }), 'me@example.com', 'chat');
    expect(result).toBe(true);
    expect(parseMessageBody).not.toHaveBeenCalled();
  });

  it('parseMessageBody вернул null (адресовано другому устройству) - молча true', async () => {
    parseMessageBody.mockResolvedValue(null);
    const result = await handleIncomingMessage(fakeStanza(), 'alice@example.com', 'chat');
    expect(result).toBe(true);
  });

  it('показывает toast, если lastDecryptFailReason=pending-device для этого bare', async () => {
    const { omemo } = await import('../../../../src/crypto/omemo/state.js');
    omemo.lastDecryptFailReason = 'pending-device';
    omemo.lastDecryptFailBareJid = 'alice@example.com';
    parseMessageBody.mockResolvedValue(null);

    await handleIncomingMessage(fakeStanza(), 'alice@example.com', 'chat');
    expect(toast).toHaveBeenCalledTimes(1);
  });

  // TODO: кейс успешного парсинга (parsed.body непустой) - проверить запись
  // в state.messages/roster и вызов renderMessages/renderRoster.
  // TODO: кейс parsed.encrypted && bare === myBareJid (эхо своего сообщения) - true, без рендера.
});
