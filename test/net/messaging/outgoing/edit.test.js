import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { connection: null, messages: {}, activeChat: null },
}));
vi.mock('../../../../src/core/uuid.js', () => ({ uuid: () => 'fixed-uuid' }));
vi.mock('../../../../src/core/debug-log.js', () => ({ debugLog: vi.fn() }));
vi.mock('../../../../src/core/dom-utils.js', () => ({ toast: vi.fn() }));
vi.mock('../../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/encrypt-or-fallback.js', () => ({ encryptOrFallback: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/stanza-body.js', () => ({ appendStanzaBody: vi.fn() }));
vi.mock('../../../../src/net/messaging/outgoing/fallback-notify.js', () => ({ notifyEncryptionFallback: vi.fn() }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { editMessage } from '../../../../src/net/messaging/outgoing/edit.js';
import { state } from '../../../../src/core/state.js';
import { toast } from '../../../../src/core/dom-utils.js';
import { history } from '../../../../src/net/history.js';
import { renderMessages } from '../../../../src/ui/chat-view/render-messages.js';
import { encryptOrFallback } from '../../../../src/net/messaging/outgoing/encrypt-or-fallback.js';
import { appendStanzaBody } from '../../../../src/net/messaging/outgoing/stanza-body.js';
import { notifyEncryptionFallback } from '../../../../src/net/messaging/outgoing/fallback-notify.js';

function fakeBuilder(){
  const calls = [];
  const node = {
    c: (name, attrs) => { calls.push(['c', name, attrs]); return node; },
    up: () => node,
  };
  return { node, calls };
}

describe('editMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connection = { send: vi.fn() };
    state.messages = {};
    state.activeChat = null;
  });

  it('сообщение с targetId не найдено среди своих исходящих - toast, sent:false, шифрование не пробуется', async () => {
    state.messages['alice@example.com'] = [{ id: 'other', out: true, body: 'x' }];

    const res = await editMessage('alice@example.com', 'missing-id', 'новый текст');

    expect(res).toEqual({ sent: false });
    expect(toast).toHaveBeenCalledWith('messaging.editNotFound');
    expect(encryptOrFallback).not.toHaveBeenCalled();
  });

  it('чужое входящее сообщение с тем же id (out:false) не считается своим - editNotFound', async () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: false, body: 'чужое' }];

    const res = await editMessage('alice@example.com', 'msg-1', 'новый текст');
    expect(res).toEqual({ sent: false });
    expect(toast).toHaveBeenCalled();
  });

  it('encryptOrFallback вернул blocked:true - sent:false, оригинал не изменяется', async () => {
    const original = { id: 'msg-1', out: true, body: 'старый' };
    state.messages['alice@example.com'] = [original];
    encryptOrFallback.mockResolvedValue({ blocked: true, encryptedEl: null, fallbackReason: null });

    const res = await editMessage('alice@example.com', 'msg-1', 'новый текст');

    expect(res).toEqual({ sent: false });
    expect(original.body).toBe('старый');
    expect(state.connection.send).not.toHaveBeenCalled();
  });

  it('успешная правка: станза несёт <replace id=targetId>, оригинал обновляется (body/encrypted/edited)', async () => {
    const original = { id: 'msg-1', out: true, body: 'старый', encrypted: false };
    state.messages['alice@example.com'] = [original];
    const { node, calls } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: { tagName: 'encrypted' }, fallbackReason: null });
    appendStanzaBody.mockReturnValue(true);

    const res = await editMessage('alice@example.com', 'msg-1', 'новый текст');

    expect(res).toEqual({ sent: true });
    expect(calls).toContainEqual(['c', 'replace', { xmlns: 'urn:xmpp:message-correct:0', id: 'msg-1' }]);
    expect(original.body).toBe('новый текст');
    expect(original.encrypted).toBe(true);
    expect(original.edited).toBe(true);
    expect(state.connection.send).toHaveBeenCalledWith(node);
  });

  it('правка использует собственный новый id станзы (не переиспользует id исправляемого сообщения)', async () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, body: 'старый' }];
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await editMessage('alice@example.com', 'msg-1', 'новый текст');

    expect(global.$msg).toHaveBeenCalledWith({ to: 'alice@example.com', type: 'chat', id: 'fixed-uuid' });
  });

  it('весь тред сохраняется в историю после правки', async () => {
    const original = { id: 'msg-1', out: true, body: 'старый' };
    state.messages['alice@example.com'] = [{ id: 'msg-0', out: true, body: 'до' }, original];
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await editMessage('alice@example.com', 'msg-1', 'новый текст');

    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
  });

  it('чат открыт - renderMessages вызывается; иначе нет', async () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, body: 'старый' }];
    state.activeChat = 'bob@example.com';
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: null });
    appendStanzaBody.mockReturnValue(false);

    await editMessage('alice@example.com', 'msg-1', 'новый текст');
    expect(renderMessages).not.toHaveBeenCalled();

    state.activeChat = 'alice@example.com';
    await editMessage('alice@example.com', 'msg-1', 'ещё правка');
    expect(renderMessages).toHaveBeenCalled();
  });

  it('после успешной отправки вызывается notifyEncryptionFallback с полученным fallbackReason', async () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, body: 'старый' }];
    const { node } = fakeBuilder();
    global.$msg = vi.fn(() => node);
    encryptOrFallback.mockResolvedValue({ blocked: false, encryptedEl: null, fallbackReason: 'no-devices' });
    appendStanzaBody.mockReturnValue(false);

    await editMessage('alice@example.com', 'msg-1', 'новый текст');
    expect(notifyEncryptionFallback).toHaveBeenCalledWith('no-devices');
  });
});
