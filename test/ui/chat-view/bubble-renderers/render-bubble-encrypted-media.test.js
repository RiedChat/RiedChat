import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('renderBubble - зашифрованное медиа (видео и т.п.)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет' });
  });

  it('singleMedia.encrypted=true (не audio/stickerpack) - media-only пузырь, media type deferrable', () => {
    const res = renderBubble({ out: false }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(String(res.html)).toContain('media-only');
    expect(placeholdersOf(res.html)[0]).toMatchObject({ type: 'deferrable', url: 'aesgcm://host/v.mp4#key' });
  });

  it('своё исходящее зашифрованное вложение - holdOff всегда false (файл уже на руках)', () => {
    const res = renderBubble({ out: true }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(placeholdersOf(res.html)[0].holdOff).toBe(false);
  });
});
