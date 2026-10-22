import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('renderBubble - stickerpack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет' });
  });

  it('singleMedia.kind === stickerpack - рисует карточку-плейсхолдер пака стикеров', () => {
    const res = renderBubble({ out: false }, { kind: 'stickerpack', url: 'http://x/pack.json' }, ctx);
    expect(String(res.html)).toContain('sticker-pack-bubble');
    expect(placeholdersOf(res.html)).toEqual([{ type: 'stickerpack', url: 'http://x/pack.json', holdOff: false }]);
  });
});
