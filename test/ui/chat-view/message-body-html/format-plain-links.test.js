import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('formatMessageBody: обычные ссылки', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.isStickerPack.mockReturnValue(false);
    media.getCached.mockReturnValue(undefined);
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('обычная (не картиночная) http-ссылка становится кликабельной <a>, текст не теряется', () => {
    const res = formatMessageBody('см. https://host/page.html тут', { out: true, nextSeq });
    expect(res.bodyHtml).toContain('<a href="https://host/page.html" target="_blank" rel="noopener">https://host/page.html</a>');
  });
});
