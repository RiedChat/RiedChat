import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com', messages: {}, activeChat: null },
}));
vi.mock('../../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../../src/net/message-body-parser.js', () => ({ parseMessageBody: vi.fn() }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));

import { handleCorrection } from '../../../../src/net/messaging/incoming/correction.js';
import { state } from '../../../../src/core/state.js';
import { history } from '../../../../src/net/history.js';
import { parseMessageBody } from '../../../../src/net/message-body-parser.js';
import { renderMessages } from '../../../../src/ui/chat-view/render-messages.js';

function fakeStanza({ targetId = 'm1', encrypted = false } = {}){
  return {
    querySelector: (sel) => {
      if(sel === 'replace') return targetId ? { getAttribute: () => targetId } : null;
      if(sel === 'encrypted') return encrypted;
      return null;
    },
  };
}

describe('handleCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.myBareJid = 'me@example.com';
    state.messages = {};
    state.activeChat = null;
  });

  it('без <replace id> ничего не делает', async () => {
    await handleCorrection(fakeStanza({ targetId: null }), 'alice@example.com');
    expect(parseMessageBody).not.toHaveBeenCalled();
  });

  it('незашифрованное эхо собственного исправления самому себе - игнорируется', async () => {
    await handleCorrection(fakeStanza({ encrypted: false }), 'me@example.com');
    expect(parseMessageBody).not.toHaveBeenCalled();
  });

  it('parseMessageBody вернул null (адресовано другому устройству) - ничего не применяет', async () => {
    parseMessageBody.mockResolvedValue(null);
    state.messages['alice@example.com'] = [{ id: 'm1', body: 'старое' }];
    await handleCorrection(fakeStanza(), 'alice@example.com');
    expect(state.messages['alice@example.com'][0].body).toBe('старое');
  });

  it('целевое сообщение не найдено в истории - тихо игнорируется, история не пишется', async () => {
    parseMessageBody.mockResolvedValue({ body: 'новый текст', encrypted: false });
    state.messages['alice@example.com'] = [{ id: 'другое', body: 'старое' }];
    await handleCorrection(fakeStanza({ targetId: 'm1' }), 'alice@example.com');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('применяет исправление: меняет body/encrypted/edited и сохраняет историю', async () => {
    parseMessageBody.mockResolvedValue({ body: 'исправленный текст', encrypted: true });
    const target = { id: 'm1', body: 'старое', encrypted: false };
    state.messages['alice@example.com'] = [target];

    await handleCorrection(fakeStanza({ targetId: 'm1' }), 'alice@example.com');

    expect(target.body).toBe('исправленный текст');
    expect(target.encrypted).toBe(true);
    expect(target.edited).toBe(true);
    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
  });

  it('не даёт контакту через <replace> подменить НАШЕ исходящее сообщение (out:true) в истории', async () => {
    parseMessageBody.mockResolvedValue({ body: 'подделанный текст', encrypted: false });
    const ourOwnMessage = { id: 'm1', body: 'то, что мы реально написали', out: true };
    state.messages['alice@example.com'] = [ourOwnMessage];

    await handleCorrection(fakeStanza({ targetId: 'm1' }), 'alice@example.com');

    expect(ourOwnMessage.body).toBe('то, что мы реально написали');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('эхо собственной правки самому себе не может подменить входящее сообщение контакта (out:false)', async () => {
    parseMessageBody.mockResolvedValue({ body: 'подделанный текст', encrypted: true });
    const contactsMessage = { id: 'm1', body: 'то, что реально написала Алиса', out: false };
    state.messages['me@example.com'] = [contactsMessage];

    await handleCorrection(fakeStanza({ targetId: 'm1', encrypted: true }), 'me@example.com');

    expect(contactsMessage.body).toBe('то, что реально написала Алиса');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('перерисовывает сообщения, только если исправление в активном чате', async () => {
    parseMessageBody.mockResolvedValue({ body: 'x', encrypted: false });
    state.messages['alice@example.com'] = [{ id: 'm1', body: 'старое' }];
    state.activeChat = 'bob@example.com';

    await handleCorrection(fakeStanza({ targetId: 'm1' }), 'alice@example.com');
    expect(renderMessages).not.toHaveBeenCalled();

    state.activeChat = 'alice@example.com';
    await handleCorrection(fakeStanza({ targetId: 'm1' }), 'alice@example.com');
    expect(renderMessages).toHaveBeenCalledTimes(1);
  });

  it('свежерасшифрованное исправление своего же сообщения самому себе (parsed.encrypted && bare===me) - не применяется повторно', async () => {
    parseMessageBody.mockResolvedValue({ body: 'x', encrypted: true });
    state.messages['me@example.com'] = [{ id: 'm1', body: 'старое' }];
    await handleCorrection(fakeStanza({ targetId: 'm1', encrypted: true }), 'me@example.com');
    expect(state.messages['me@example.com'][0].body).toBe('старое');
  });
});
