import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/core/state.js', () => ({
  state: { messages: {}, activeChat: null, connection: null },
}));
vi.mock('../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../src/i18n/t.js', () => ({ t: (key) => key }));
vi.mock('../../../src/ui/chat-view/render-messages.js', () => ({ patchMessageTicks: vi.fn() }));
vi.spyOn(crypto, 'randomUUID').mockReturnValue('fixed-uuid');

import { handleDisplayedMarker, sendDisplayedMarker } from '../../../src/net/messaging/displayed-marker.js';
import { state } from '../../../src/core/state.js';
import { history } from '../../../src/net/history.js';
import { patchMessageTicks } from '../../../src/ui/chat-view/render-messages.js';

describe('handleDisplayedMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.messages = {};
    state.activeChat = null;
  });

  it('нет треда для fromBare - ничего не делает', () => {
    handleDisplayedMarker('alice@example.com', 'msg-2');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('markerId пустой/undefined - ничего не делает', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    handleDisplayedMarker('alice@example.com', null);
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('маркер относится к сообщению, ещё не попавшему в локальную историю - no-op', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    handleDisplayedMarker('alice@example.com', 'msg-unknown');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('помечает read все свои исходящие вплоть до markerId включительно (не позже)', () => {
    state.messages['alice@example.com'] = [
      { id: 'msg-1', out: true, status: 'sent' },
      { id: 'msg-2', out: true, status: 'sent' },
      { id: 'msg-3', out: true, status: 'sent' },
    ];
    handleDisplayedMarker('alice@example.com', 'msg-2');

    const list = state.messages['alice@example.com'];
    expect(list[0].status).toBe('read');
    expect(list[1].status).toBe('read');
    expect(list[2].status).toBe('sent');
  });

  it('входящие сообщения (out:false) не трогает, даже если попали в диапазон', () => {
    state.messages['alice@example.com'] = [
      { id: 'in-1', out: false, status: undefined },
      { id: 'msg-1', out: true, status: 'sent' },
    ];
    handleDisplayedMarker('alice@example.com', 'msg-1');

    expect(state.messages['alice@example.com'][0].status).toBeUndefined();
    expect(state.messages['alice@example.com'][1].status).toBe('read');
  });

  it('все сообщения в диапазоне уже read - не пишет в историю и не патчит галочки повторно', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'read' }];
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(history.saveThread).not.toHaveBeenCalled();
    expect(patchMessageTicks).not.toHaveBeenCalled();
  });

  it('были реальные изменения - сохраняет весь тред в историю', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
  });

  it('чат сейчас открыт (activeChat === fromBare) - точечно патчит галочки затронутых сообщений', () => {
    state.messages['alice@example.com'] = [
      { id: 'msg-1', out: true, status: 'sent' },
      { id: 'msg-2', out: true, status: 'sent' },
    ];
    state.activeChat = 'alice@example.com';
    handleDisplayedMarker('alice@example.com', 'msg-2');
    expect(patchMessageTicks).toHaveBeenCalledWith(0);
    expect(patchMessageTicks).toHaveBeenCalledWith(1);
  });

  it('чат другой - patchMessageTicks не вызывается', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    state.activeChat = 'bob@example.com';
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(patchMessageTicks).not.toHaveBeenCalled();
  });
});

function fakeBuilder(){
  const calls = [];
  const node = {
    c: (name, attrs) => { calls.push(['c', name, attrs]); return node; },
  };
  return { node, calls };
}

describe('sendDisplayedMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connection = { send: vi.fn() };
  });

  it('строит <displayed id=msgId> внутри <message to=toJid> и шлёт через connection.send', () => {
    const { node, calls } = fakeBuilder();
    global.$msg = vi.fn((attrs) => { calls.push(['$msg', attrs]); return node; });

    sendDisplayedMarker('alice@example.com', 'msg-1');

    expect(global.$msg).toHaveBeenCalledWith({ to: 'alice@example.com', type: 'chat', id: 'fixed-uuid' });
    expect(calls).toContainEqual(['c', 'displayed', { xmlns: 'urn:xmpp:chat-markers:0', id: 'msg-1' }]);
    expect(state.connection.send).toHaveBeenCalledWith(node);
  });

  it('без msgId - ничего не строит и не отправляет', () => {
    global.$msg = vi.fn();
    sendDisplayedMarker('alice@example.com', null);
    expect(global.$msg).not.toHaveBeenCalled();
    expect(state.connection.send).not.toHaveBeenCalled();
  });

  it('без активного connection - не падает и не пытается отправить', () => {
    state.connection = null;
    global.$msg = vi.fn();
    expect(() => sendDisplayedMarker('alice@example.com', 'msg-1')).not.toThrow();
    expect(global.$msg).not.toHaveBeenCalled();
  });
});
