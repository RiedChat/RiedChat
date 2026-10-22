import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

describe('formatMessageBody: обычные ссылки', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    autoload.video.load.mockReturnValue(false);
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('обычная (не картиночная) http-ссылка становится кликабельной <a>, текст не теряется', () => {
    const res = formatMessageBody('см. https://host/page.html тут', { out: true });
    expect(res.bodyHtml).toContain('<a href="https://host/page.html" target="_blank" rel="noopener">https://host/page.html</a>');
  });
});
