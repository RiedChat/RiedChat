import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { connection: null, messages: {}, activeChat: null },
}));
vi.mock('../../../../src/core/uuid.js', () => ({ uuid: () => 'fixed-uuid' }));
vi.mock('../../../../src/core/debug-log.js', () => ({ debugLog: vi.fn() }));
vi.mock('../../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../../src/ui/roster.js', () => ({ renderRoster: vi.fn() }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ bumpContactMessageCount: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/encrypt-or-fallback.js', () => ({ encryptOrFallback: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/stanza-body.js', () => ({ appendStanzaBody: vi.fn() }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { sendMessage } from '../../../../src/net/messaging/outgoing/send.js';
import { state } from '../../../../src/core/state.js';
import { history } from '../../../../src/net/history.js';
import { renderRoster } from '../../../../src/ui/roster.js';
import { renderMessages } from '../../../../src/ui/chat-view/render-messages.js';
import { bumpContactMessageCount } from '../../../../src/net/trusted-contacts.js';
import { encryptOrFallback } from '../../../../src/net/messaging/outgoing/encrypt-or-fallback.js';
import { appendStanzaBody } from '../../../../src/net/messaging/outgoing/stanza-body.js';

describe('sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connection = { send: vi.fn() };
    state.messages = {};
    state.activeChat = null;
    global.$msg = vi.fn(() => ({ marker: 'stanza' }));
  });

  it('encryptOrFallback вернул blocked:true - sent:false, ничего не отправляется и не пишется в историю', async () => {
    encryptOrFallback.mockResolvedValue({ blocked: true, encryptedEl: null, fallbackReason: 'no-devices' });

    const res = await sendMessage('alice@example.com', 'привет');

    expect(res).toEqual({ sent: false, encrypted: false, fallbackReason: 'no-devices' });
    expect(global.$msg).not.toHaveBeenCalled();
    expect(state.connection.send).not.toHaveBeenCalled();
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('успешная отправка: одинаковый id у станзы и локальной записи сообщения', async () => {
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await sendMessage('alice@example.com', 'привет');

    expect(global.$msg).toHaveBeenCalledWith({ to: 'alice@example.com', type: 'chat', id: 'fixed-uuid' });
    expect(state.messages['alice@example.com'][0]).toMatchObject({
      id: 'fixed-uuid', body: 'привет', out: true, encrypted: false, read: true, status: 'sent',
    });
  });

  it('зашифрованная отправка: encrypted=true берётся из appendStanzaBody, а не додумывается заново', async () => {
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: { tagName: 'encrypted' }, fallbackReason: null });
    appendStanzaBody.mockReturnValue(true);

    const res = await sendMessage('alice@example.com', 'привет');

    expect(res.encrypted).toBe(true);
    expect(state.messages['alice@example.com'][0].encrypted).toBe(true);
  });

  it('чат сейчас открыт (activeChat === toJid) - renderMessages вызывается', async () => {
    state.activeChat = 'alice@example.com';
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await sendMessage('alice@example.com', 'привет');
    expect(renderMessages).toHaveBeenCalled();
  });

  it('чат сейчас не открыт (activeChat - другой) - renderMessages не вызывается, но renderRoster вызывается всегда', async () => {
    state.activeChat = 'bob@example.com';
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await sendMessage('alice@example.com', 'привет');
    expect(renderMessages).not.toHaveBeenCalled();
    expect(renderRoster).toHaveBeenCalled();
  });

  it('счётчик доверенного контакта увеличивается и на исходящие тоже', async () => {
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await sendMessage('alice@example.com', 'привет');
    expect(bumpContactMessageCount).toHaveBeenCalledWith('alice@example.com');
  });

  it('пришедшее сообщение сохраняется в историю треда целиком (весь массив, не только новую запись)', async () => {
    state.messages['alice@example.com'] = [{ id: 'old', body: 'ранее', out: true }];
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await sendMessage('alice@example.com', 'привет');

    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
    expect(state.messages['alice@example.com']).toHaveLength(2);
  });

  it('fallbackReason из encryptOrFallback пробрасывается наружу при успешной отправке', async () => {
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: 'no-devices' });
    appendStanzaBody.mockReturnValue(false);

    const res = await sendMessage('alice@example.com', 'привет');
    expect(res).toEqual({ sent: true, encrypted: false, fallbackReason: 'no-devices' });
  });
});
