import { describe, it, expect, vi } from 'vitest';
import { appendStanzaBody } from '../../../../src/net/messaging/outgoing/stanza-body.js';

// Минимальный мок Strophe.Builder: фиксирует вызовы .c()/.cnode()/.t()/.up()
// в плоский лог, .up() возвращает тот же объект (чейнинг как у Strophe).
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
  it('незашифрованное сообщение: пишет открытый body, markable, encrypted=false', () => {
    const { node, calls } = fakeBuilder();
    const encrypted = appendStanzaBody(node, null, 'привет');

    expect(encrypted).toBe(false);
    expect(calls).toContainEqual(['c', 'body', undefined]);
    expect(calls).toContainEqual(['t', 'привет']);
    expect(calls.some(c => c[0] === 'c' && c[1] === 'markable')).toBe(true);
    expect(calls.some(c => c[0] === 'cnode')).toBe(false);
  });

  it('зашифрованное сообщение: вставляет cnode(encryptedEl), body-плейсхолдер, store-hint, markable, encrypted=true', () => {
    const { node, calls } = fakeBuilder();
    const encryptedEl = { tagName: 'encrypted' };
    const encrypted = appendStanzaBody(node, encryptedEl, 'игнорируется');

    expect(encrypted).toBe(true);
    expect(calls).toContainEqual(['cnode', encryptedEl]);
    expect(calls.some(c => c[0] === 'c' && c[1] === 'store')).toBe(true);
    expect(calls.some(c => c[0] === 't' && c[1] === 'игнорируется')).toBe(false);
    expect(calls.some(c => c[0] === 'c' && c[1] === 'markable')).toBe(true);
  });
});
