import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { connection: null, messages: {}, activeChat: null },
}));
vi.spyOn(crypto, 'randomUUID').mockReturnValue('fixed-uuid');
vi.mock('../../../../src/core/debug-log.js', () => ({ debugLog: vi.fn() }));
vi.mock('../../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../../src/ui/roster.js', () => ({ patchRosterRow: vi.fn() }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ appendMessage: vi.fn() }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ bumpOutgoingMessageCount: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/encrypt-required.js', () => ({ encryptRequired: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/stanza-body.js', () => ({ appendStanzaBody: vi.fn() }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { sendMessage } from '../../../../src/net/messaging/outgoing/send.js';
import { state } from '../../../../src/core/state.js';
import { history } from '../../../../src/net/history.js';
import { patchRosterRow } from '../../../../src/ui/roster.js';
import { appendMessage } from '../../../../src/ui/chat-view/render-messages.js';
import { bumpOutgoingMessageCount } from '../../../../src/net/trusted-contacts.js';
import { encryptRequired } from '../../../../src/net/messaging/outgoing/encrypt-required.js';
import { appendStanzaBody } from '../../../../src/net/messaging/outgoing/stanza-body.js';

describe('sendMessage', () => {
  const ENCRYPTED_EL = { tagName: 'encrypted' };

  beforeEach(() => {
    vi.clearAllMocks();
    state.connection = { send: vi.fn() };
    state.messages = {};
    state.activeChat = null;
    global.$msg = vi.fn(() => ({ marker: 'stanza' }));
    encryptRequired.mockResolvedValue({ encryptedEl: ENCRYPTED_EL, reason: null });
  });

  it('зашифровать не удалось - sent:false, ничего не отправляется и не пишется в историю', async () => {
    encryptRequired.mockResolvedValue({ encryptedEl: null, reason: 'no-devices' });

    const res = await sendMessage('alice@example.com', 'привет');

    expect(res).toEqual({ sent: false });
    expect(global.$msg).not.toHaveBeenCalled();
    expect(state.connection.send).not.toHaveBeenCalled();
    expect(history.saveThread).not.toHaveBeenCalled();
    expect(bumpOutgoingMessageCount).not.toHaveBeenCalled();
  });

  it('успешная отправка: одинаковый id у станзы и локальной записи сообщения, запись помечена encrypted:true', async () => {
    const res = await sendMessage('alice@example.com', 'привет');

    expect(res).toEqual({ sent: true });
    expect(global.$msg).toHaveBeenCalledWith({ to: 'alice@example.com', type: 'chat', id: 'fixed-uuid' });
    expect(state.messages['alice@example.com'][0]).toMatchObject({
      id: 'fixed-uuid', body: 'привет', out: true, encrypted: true, read: true, status: 'sent',
    });
  });

  it('в станзу кладётся именно зашифрованный элемент (тело открытым текстом в неё не попадает)', async () => {
    await sendMessage('alice@example.com', 'привет');

    expect(encryptRequired).toHaveBeenCalledWith('alice@example.com', 'привет');
    expect(appendStanzaBody).toHaveBeenCalledWith({ marker: 'stanza' }, ENCRYPTED_EL);
    expect(state.connection.send).toHaveBeenCalledWith({ marker: 'stanza' });
  });

  it('чат сейчас открыт (activeChat === toJid) - appendMessage вызывается', async () => {
    state.activeChat = 'alice@example.com';

    await sendMessage('alice@example.com', 'привет');
    expect(appendMessage).toHaveBeenCalledWith(0);
  });

  it('чат сейчас не открыт (activeChat - другой) - appendMessage не вызывается, но patchRosterRow вызывается всегда', async () => {
    state.activeChat = 'bob@example.com';

    await sendMessage('alice@example.com', 'привет');
    expect(appendMessage).not.toHaveBeenCalled();
    expect(patchRosterRow).toHaveBeenCalledWith('alice@example.com');
  });

  it('счётчик доверенного контакта увеличивается и на исходящие тоже', async () => {
    await sendMessage('alice@example.com', 'привет');
    expect(bumpOutgoingMessageCount).toHaveBeenCalledWith('alice@example.com');
  });

  it('пришедшее сообщение сохраняется в историю треда целиком (весь массив, не только новую запись)', async () => {
    state.messages['alice@example.com'] = [{ id: 'old', body: 'ранее', out: true }];

    await sendMessage('alice@example.com', 'привет');

    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
    expect(state.messages['alice@example.com']).toHaveLength(2);
  });
});
