import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { messages: {}, activeChat: null },
}));
vi.mock('../../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));
vi.mock('../../../../src/ui/chat-view/render-messages.js', () => ({ renderMessages: vi.fn() }));

import { handleDisplayedMarker } from '../../../../src/net/messaging/incoming/displayed-marker.js';
import { state } from '../../../../src/core/state.js';
import { history } from '../../../../src/net/history.js';
import { renderMessages } from '../../../../src/ui/chat-view/render-messages.js';

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

  it('все сообщения в диапазоне уже read - не пишет в историю и не рендерит повторно', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'read' }];
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(history.saveThread).not.toHaveBeenCalled();
    expect(renderMessages).not.toHaveBeenCalled();
  });

  it('были реальные изменения - сохраняет весь тред в историю', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
  });

  it('чат сейчас открыт (activeChat === fromBare) - вызывает renderMessages', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    state.activeChat = 'alice@example.com';
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(renderMessages).toHaveBeenCalled();
  });

  it('чат другой - renderMessages не вызывается', () => {
    state.messages['alice@example.com'] = [{ id: 'msg-1', out: true, status: 'sent' }];
    state.activeChat = 'bob@example.com';
    handleDisplayedMarker('alice@example.com', 'msg-1');
    expect(renderMessages).not.toHaveBeenCalled();
  });
});
