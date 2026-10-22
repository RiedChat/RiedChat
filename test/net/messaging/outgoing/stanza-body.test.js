import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { appendStanzaBody } from '../../../../src/net/messaging/outgoing/stanza-body.js';

// Мини-мок Strophe.Builder: пишет вызовы .c()/.cnode()/.t()/.up() в плоский лог, .up() возвращает тот же объект.
function fakeBuilder(){
  const calls = [];
  const node = {
    c: (name, attrs) => { calls.push(['c', name, attrs]); return node; },
    cnode: (el) => { calls.push(['cnode', el]); return node; },
    t: (text) => { calls.push(['t', text]); return node; },
    up: () => { calls.push(['up']); return node; },
  };
  return { node, calls };
}

describe('appendStanzaBody', () => {
  it('вставляет cnode(encryptedEl), body-плейсхолдер, store-hint и markable', () => {
    const { node, calls } = fakeBuilder();
    const encryptedEl = { tagName: 'encrypted' };
    appendStanzaBody(node, encryptedEl);

    expect(calls).toContainEqual(['cnode', encryptedEl]);
    expect(calls).toContainEqual(['c', 'body', undefined]);
    expect(calls.some(c => c[0] === 't' && c[1] === 'messaging.omemoPlaceholder')).toBe(true);
    expect(calls.some(c => c[0] === 'c' && c[1] === 'store')).toBe(true);
    expect(calls.some(c => c[0] === 'c' && c[1] === 'markable')).toBe(true);
  });
});
