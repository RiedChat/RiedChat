import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

describe('formatMessageBody: базовое поведение', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    autoload.video.load.mockReturnValue(false);
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('обычный текст без цитаты и медиа - экранируется, quoteHtml пуст, плейсхолдеров нет', () => {
    const res = formatMessageBody('<script>alert(1)</script>', { out: false });
    expect(res.quoteHtml).toBe('');
    expect(res.bodyHtml).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.bodyHtml).not.toContain('data-media-type');
  });
});
