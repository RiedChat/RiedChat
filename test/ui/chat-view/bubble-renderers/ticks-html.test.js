import './_mocks.js';
import { describe, it, expect } from 'vitest';
import { ticksHtml } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { ICON_CHECK } from '../../../../src/core/icons.js';

describe('ticksHtml', () => {
  it('входящее сообщение (out:false) - пустая строка, галочек нет', () => {
    expect(ticksHtml({ out: false, status: 'read' })).toBe('');
  });

  it('своё сообщение без статуса read - одна галочка, без класса read', () => {
    const out = ticksHtml({ out: true, status: 'sent' });
    expect(out).toContain(ICON_CHECK);
    expect(out.split(ICON_CHECK).length - 1).toBe(1);
    expect(out).not.toContain('read');
  });

  it('своё сообщение со статусом read - двойная галочка и класс read', () => {
    const out = ticksHtml({ out: true, status: 'read' });
    expect(out.split(ICON_CHECK).length - 1).toBe(2);
    expect(out).toContain('class="ticks read"');
  });

  it('m == null/undefined - не падает, пустая строка', () => {
    expect(ticksHtml(null)).toBe('');
    expect(ticksHtml(undefined)).toBe('');
  });
});
