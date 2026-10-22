import { describe, it, expect, vi, beforeEach } from 'vitest';

// handleIncomingMessage тянет state/omemo/history/roster/render - мокаем побочные модули.
vi.mock('../../../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com', roster: {}, messages: {} },
}));
vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { lastDecryptFailReason: null, lastDecryptFailBareJid: null },
}));
vi.mock('../../../../src/net/message-body-parser.js', () => ({
  parseIncomingBody: vi.fn(),
}));
vi.mock('../../../../src/net/messaging/outgoing.js', () => ({
  sendDisplayedMarker: vi.fn(),
}));
vi.mock('../../../../src/ui/roster.js', () => ({ renderRoster: vi.fn() }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ bumpOutgoingMessageCount: vi.fn() }));
vi.mock('../../../../src/core/dom-utils.js', () => ({ toast: vi.fn(), nickOf: (j) => j }));
vi.spyOn(crypto, 'randomUUID').mockReturnValue('fixed-uuid');
vi.mock('../../../../src/core/debug-log.js', () => ({ debugLog: vi.fn() }));
vi.mock('../../../../src/net/history.js', () => ({ history: { save: vi.fn() } }));

import { handleIncomingMessage } from '../../../../src/net/messaging/incoming/message-handler.js';
import { parseIncomingBody } from '../../../../src/net/message-body-parser.js';
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
    expect(parseIncomingBody).not.toHaveBeenCalled();
  });

  it('parseIncomingBody вернул null (адресовано другому устройству) - молча true', async () => {
    parseIncomingBody.mockResolvedValue(null);
    const result = await handleIncomingMessage(fakeStanza(), 'alice@example.com', 'chat');
    expect(result).toBe(true);
  });

  it('показывает toast, если lastDecryptFailReason=pending-device для этого bare', async () => {
    const { omemo } = await import('../../../../src/crypto/omemo/state.js');
    omemo.lastDecryptFailReason = 'pending-device';
    omemo.lastDecryptFailBareJid = 'alice@example.com';
    parseIncomingBody.mockResolvedValue(null);

    await handleIncomingMessage(fakeStanza(), 'alice@example.com', 'chat');
    expect(toast).toHaveBeenCalledTimes(1);
  });

  // TODO: успешный парсинг (parsed.body непустой) - запись в state.messages/roster, вызов renderMessages/renderRoster.
  // TODO: parsed.encrypted && bare === myBareJid (эхо своего) - true, без рендера.
});
