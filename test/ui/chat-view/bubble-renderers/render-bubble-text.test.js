import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';

describe('renderBubble - текстовый пузырь (без singleMedia)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет' });
  });

  it('без singleMedia - текстовый пузырь через formatMessageBody', () => {
    const res = renderBubble({ out: false, body: 'привет' }, null, ctx);
    expect(formatMessageBody).toHaveBeenCalledWith('привет', { out: false });
    expect(String(res.html)).toContain('привет');
  });

  it('исправленное сообщение (m.edited) - в текстовом пузыре появляется пометка edited', () => {
    const res = renderBubble({ out: false, body: 'x', edited: true }, null, ctx);
    expect(String(res.html)).toContain('edited-tag');
  });
});
