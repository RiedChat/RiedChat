import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { connection: null },
}));
vi.mock('../../../../src/core/uuid.js', () => ({ uuid: () => 'fixed-uuid' }));

import { sendDisplayedMarker } from '../../../../src/net/messaging/outgoing/displayed-marker.js';
import { state } from '../../../../src/core/state.js';

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
