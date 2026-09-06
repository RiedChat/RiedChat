import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NS_CHAT_MARKERS, NS_PUBSUB_EVENT, NS_LAST_MESSAGE_CORRECTION, NS_CALL } from '../../../../src/core/constants.js';

vi.mock('../../../../src/crypto/omemo/state.js', () => ({
  omemo: { handlePubsubEvent: vi.fn() },
}));
vi.mock('../../../../src/net/messaging/incoming/correction.js', () => ({
  handleCorrection: vi.fn(),
}));
vi.mock('../../../../src/net/messaging/incoming/displayed-marker.js', () => ({
  handleDisplayedMarker: vi.fn(),
}));
vi.mock('../../../../src/net/messaging/incoming/call-signal.js', () => ({
  handleCallSignal: vi.fn(),
}));

import { earlyHandlers } from '../../../../src/net/messaging/incoming/early-handlers.js';
import { omemo } from '../../../../src/crypto/omemo/state.js';
import { handleCorrection } from '../../../../src/net/messaging/incoming/correction.js';
import { handleDisplayedMarker } from '../../../../src/net/messaging/incoming/displayed-marker.js';
import { handleCallSignal } from '../../../../src/net/messaging/incoming/call-signal.js';

// Плоский мок stanza: querySelector отдаёт то, что положили в selectors,
// getAttribute отдаёт то, что положили в attrs.
function fakeStanza(selectors = {}, attrs = {}){
  return {
    querySelector: (sel) => (sel in selectors ? selectors[sel] : null),
    getAttribute: (a) => (a in attrs ? attrs[a] : null),
  };
}

describe('earlyHandlers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('[0] type=error - совпадает независимо от содержимого станзы, handle ничего не делает', () => {
    const h = earlyHandlers[0];
    expect(h.match(fakeStanza(), null, 'error')).toBe(true);
    expect(h.match(fakeStanza(), null, 'chat')).toBe(false);
    expect(() => h.handle()).not.toThrow();
  });

  it('[1] MAM-результат (result[xmlns=urn:xmpp:mam:2]) - совпадает, handle ничего не делает (разбирается отдельно)', () => {
    const h = earlyHandlers[1];
    const stanza = fakeStanza({ 'result[xmlns="urn:xmpp:mam:2"]': { tagName: 'result' } });
    expect(h.match(stanza)).toBe(true);
    expect(h.match(fakeStanza())).toBe(false);
    expect(() => h.handle()).not.toThrow();
  });

  it('[2] call-signal с правильным namespace - совпадает и делегирует в handleCallSignal(stanza, bare)', async () => {
    const h = earlyHandlers[2];
    const sigEl = { namespaceURI: NS_CALL };
    const stanza = fakeStanza({ 'call-signal': sigEl });
    expect(h.match(stanza)).toBe(true);

    await h.handle(stanza, 'alice@example.com');
    expect(handleCallSignal).toHaveBeenCalledWith(stanza, 'alice@example.com');
  });

  it('[2] элемент <call-signal> с чужим namespace - НЕ совпадает (не наш неймспейс)', () => {
    const h = earlyHandlers[2];
    const stanza = fakeStanza({ 'call-signal': { namespaceURI: 'someone:else:0' } });
    expect(h.match(stanza)).toBe(false);
  });

  it('[3] <replace> с NS_LAST_MESSAGE_CORRECTION - совпадает и делегирует в handleCorrection', async () => {
    const h = earlyHandlers[3];
    const replaceEl = { namespaceURI: NS_LAST_MESSAGE_CORRECTION };
    const stanza = fakeStanza({ replace: replaceEl });
    expect(h.match(stanza)).toBe(true);

    await h.handle(stanza, 'alice@example.com');
    expect(handleCorrection).toHaveBeenCalledWith(stanza, 'alice@example.com');
  });

  it('[4] <event> с NS_PUBSUB_EVENT - совпадает и делегирует в omemo.handlePubsubEvent(bare, eventEl)', () => {
    const h = earlyHandlers[4];
    const eventEl = { namespaceURI: NS_PUBSUB_EVENT };
    const stanza = fakeStanza({ event: eventEl });
    expect(h.match(stanza)).toBe(true);

    h.handle(stanza, 'alice@example.com');
    expect(omemo.handlePubsubEvent).toHaveBeenCalledWith('alice@example.com', eventEl);
  });

  it('[5] <displayed> с NS_CHAT_MARKERS - совпадает и делегирует в handleDisplayedMarker(bare, id)', () => {
    const h = earlyHandlers[5];
    const displayedEl = { namespaceURI: NS_CHAT_MARKERS, getAttribute: (a) => (a === 'id' ? 'msg-7' : null) };
    const stanza = fakeStanza({ displayed: displayedEl });
    expect(h.match(stanza)).toBe(true);

    h.handle(stanza, 'alice@example.com');
    expect(handleDisplayedMarker).toHaveBeenCalledWith('alice@example.com', 'msg-7');
  });

  it('обычное текстовое сообщение (ничего служебного) не совпадает ни с одним из обработчиков', () => {
    const stanza = fakeStanza({ body: { textContent: 'привет' } });
    for(const h of earlyHandlers){
      expect(h.match(stanza, 'alice@example.com', 'chat')).toBe(false);
    }
  });
});
