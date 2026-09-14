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
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('без singleMedia - текстовый пузырь через formatMessageBody', () => {
    const res = renderBubble({ out: false, body: 'привет' }, null, ctx);
    expect(formatMessageBody).toHaveBeenCalledWith('привет', { out: false, nextSeq: ctx.nextSeq });
    expect(res.html).toContain('привет');
  });

  it('текстовый пузырь с mediaPlaceholders - маппит kind=plain-image в media.type=plain-image, остальное в deferrable', () => {
    formatMessageBody.mockReturnValue({
      quoteHtml: '', bodyHtml: '',
      mediaPlaceholders: [
        { id: 'm1', url: 'u1', holdOff: false, kind: 'plain-image' },
        { id: 'm2', url: 'u2', holdOff: true, kind: 'video' },
      ],
    });
    const res = renderBubble({ out: false, body: 'x' }, null, ctx);
    expect(res.media).toEqual([
      { type: 'plain-image', id: 'm1', url: 'u1', holdOff: false },
      { type: 'deferrable', id: 'm2', url: 'u2', holdOff: true },
    ]);
  });

  it('исправленное сообщение (m.edited) - в текстовом пузыре появляется пометка edited', () => {
    const res = renderBubble({ out: false, body: 'x', edited: true }, null, ctx);
    expect(res.html).toContain('edited-tag');
  });
});
