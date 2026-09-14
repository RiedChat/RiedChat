import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';

describe('renderBubble - зашифрованное медиа (видео и т.п.)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('singleMedia.encrypted=true (не audio/stickerpack) - media-only пузырь, media type deferrable', () => {
    const res = renderBubble({ out: false }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(res.html).toContain('media-only');
    expect(res.media[0]).toMatchObject({ type: 'deferrable', url: 'aesgcm://host/v.mp4#key' });
  });

  it('своё исходящее зашифрованное вложение - holdOff всегда false (файл уже на руках)', () => {
    const res = renderBubble({ out: true }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(res.media[0].holdOff).toBe(false);
  });
});
