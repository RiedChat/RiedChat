import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('formatMessageBody: базовое поведение', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.isStickerPack.mockReturnValue(false);
    media.getCached.mockReturnValue(undefined);
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('обычный текст без цитаты и медиа - экранируется, quoteHtml пуст, mediaPlaceholders пуст', () => {
    const res = formatMessageBody('<script>alert(1)</script>', { out: false, nextSeq });
    expect(res.quoteHtml).toBe('');
    expect(res.bodyHtml).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.mediaPlaceholders).toEqual([]);
  });
});
