import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';

describe('renderBubble - stickerpack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('singleMedia.kind === stickerpack - рисует карточку-плейсхолдер пака стикеров', () => {
    const res = renderBubble({ out: false }, { kind: 'stickerpack', url: 'http://x/pack.zip' }, ctx);
    expect(res.html).toContain('sticker-pack-bubble');
    expect(res.media).toEqual([{ type: 'stickerpack', id: expect.any(String), url: 'http://x/pack.zip' }]);
  });
});
