import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/core/state.js', () => {
  const state = { messages: {} };
  return { state, messagesOf: jid => state.messages[jid] || [] };
});
vi.mock('../../../src/core/dom-utils.js', () => ({
  $: vi.fn(),
  isUnread: m => !!m && !m.out && m.read === false,
}));
vi.mock('../../../src/net/history.js', () => ({
  history: { saveThread: vi.fn().mockResolvedValue(undefined), reportWriteError: vi.fn() },
}));
vi.mock('../../../src/net/messaging/displayed-marker.js', () => ({ sendDisplayedMarker: vi.fn() }));
vi.mock('../../../src/ui/roster.js', () => ({ patchRosterRow: vi.fn() }));
vi.mock('../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { markChatRead } from '../../../src/ui/chat-view/unread-tracking.js';
import { state } from '../../../src/core/state.js';
import { history } from '../../../src/net/history.js';
import { sendDisplayedMarker } from '../../../src/net/messaging/displayed-marker.js';
import { patchRosterRow } from '../../../src/ui/roster.js';

describe('markChatRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.messages = {};
  });

  it('нет треда для чата - ничего не делает', () => {
    markChatRead('alice@example.com');
    expect(history.saveThread).not.toHaveBeenCalled();
    expect(sendDisplayedMarker).not.toHaveBeenCalled();
  });

  it('пустой тред ([]) - ничего не делает', () => {
    state.messages['alice@example.com'] = [];
    markChatRead('alice@example.com');
    expect(history.saveThread).not.toHaveBeenCalled();
  });

  it('помечает read все входящие с read:false, свои исходящие не трогает', () => {
    state.messages['alice@example.com'] = [
      { id: '1', out: false, read: false },
      { id: '2', out: true, read: true },
      { id: '3', out: false, read: false },
    ];
    markChatRead('alice@example.com');

    const list = state.messages['alice@example.com'];
    expect(list[0].read).toBe(true);
    expect(list[2].read).toBe(true);
    expect(list[1].read).toBe(true); // не менялось, было true
  });

  it('уже read:true входящее не считается изменением - если больше нечего менять, saveThread не вызывается', () => {
    state.messages['alice@example.com'] = [{ id: '1', out: false, read: true }];
    markChatRead('alice@example.com');
    expect(history.saveThread).not.toHaveBeenCalled();
    expect(patchRosterRow).not.toHaveBeenCalled();
  });

  it('были реальные изменения - сохраняет тред и обновляет roster', () => {
    state.messages['alice@example.com'] = [{ id: '1', out: false, read: false }];
    markChatRead('alice@example.com');
    expect(history.saveThread).toHaveBeenCalledWith('alice@example.com', state.messages['alice@example.com']);
    expect(patchRosterRow).toHaveBeenCalledWith('alice@example.com');
  });

  it('шлёт <displayed> на ПОСЛЕДНЕЕ markable входящее сообщение (не на первое из нескольких)', () => {
    state.messages['alice@example.com'] = [
      { id: 'm1', out: false, read: false, markable: true },
      { id: 'm2', out: false, read: false, markable: true },
      { id: 'm3', out: false, read: false, markable: false },
    ];
    markChatRead('alice@example.com');
    expect(sendDisplayedMarker).toHaveBeenCalledWith('alice@example.com', 'm2');
  });

  it('среди входящих нет markable - displayed-маркер не отправляется', () => {
    state.messages['alice@example.com'] = [{ id: 'm1', out: false, read: false, markable: false }];
    markChatRead('alice@example.com');
    expect(sendDisplayedMarker).not.toHaveBeenCalled();
  });

  it('изменений не было (всё уже read), но markable-сообщение есть - маркер всё равно НЕ шлётся повторно', () => {
    state.messages['alice@example.com'] = [{ id: 'm1', out: false, read: true, markable: true }];
    markChatRead('alice@example.com');
    expect(sendDisplayedMarker).not.toHaveBeenCalled();
  });

  it('markable-статус смотрит только на входящие - своё markable исходящее не выбирается как lastMarkableId', () => {
    state.messages['alice@example.com'] = [
      { id: 'in-1', out: false, read: false, markable: true },
      { id: 'out-1', out: true, markable: true },
    ];
    markChatRead('alice@example.com');
    expect(sendDisplayedMarker).toHaveBeenCalledWith('alice@example.com', 'in-1');
  });
});
