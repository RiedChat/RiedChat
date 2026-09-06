import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com' },
}));
vi.mock('../../../../src/net/history.js', () => ({
  history: { setMeta: vi.fn().mockResolvedValue(undefined) },
}));

import { applyWatermark } from '../../../../src/net/messaging/incoming/watermark.js';
import { history } from '../../../../src/net/history.js';

function fakeStanza(sidEl){
  return { querySelector: (sel) => (sel === 'stanza-id' ? sidEl : null) };
}

describe('applyWatermark', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('stanza-id проставлен нашим сервером (by === myBareJid) - сохраняет id как mamLastId', () => {
    const sidEl = { getAttribute: (a) => ({ by: 'me@example.com', id: 'stanza-42' }[a]) };
    applyWatermark(fakeStanza(sidEl));
    expect(history.setMeta).toHaveBeenCalledWith('mamLastId', 'stanza-42');
  });

  it('нет элемента stanza-id вообще - ничего не сохраняет', () => {
    applyWatermark(fakeStanza(null));
    expect(history.setMeta).not.toHaveBeenCalled();
  });

  it('stanza-id проставлен ЧУЖИМ сервером (by чужого bare JID) - игнорирует', () => {
    const sidEl = { getAttribute: (a) => ({ by: 'someone-else@example.com', id: 'stanza-1' }[a]) };
    applyWatermark(fakeStanza(sidEl));
    expect(history.setMeta).not.toHaveBeenCalled();
  });

  it('stanza-id без атрибута id - не сохраняет (нечего запоминать)', () => {
    const sidEl = { getAttribute: (a) => ({ by: 'me@example.com', id: null }[a]) };
    applyWatermark(fakeStanza(sidEl));
    expect(history.setMeta).not.toHaveBeenCalled();
  });
});
