import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';
import { ctx } from './_mocks.js';

describe('renderBubble - открытая картинка', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('singleMedia без encrypted (открытая картинка) - plain image бабл, автозагрузка для своих сообщений', () => {
    const res = renderBubble({ out: true }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(res.html).toContain('<img src="https://host/pic.jpg">');
    expect(res.media).toEqual([]);
  });

  it('чужая открытая картинка без включённой автозагрузки/доверия - плейсхолдер "нажмите загрузить", media непустой', () => {
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
    const res = renderBubble({ out: false }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(res.html).not.toContain('<img src=');
    expect(res.media).toEqual([{ type: 'plain-image', id: expect.any(String), url: 'https://host/pic.jpg' }]);
  });

  it('чужая открытая картинка, автозагрузка включена И контакт доверенный - грузит сразу', () => {
    loadImageAutoDownloadEnabled.mockReturnValue(true);
    isTrustedContact.mockReturnValue(true);
    const res = renderBubble({ out: false }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(res.html).toContain('<img src="https://host/pic.jpg">');
    expect(res.media).toEqual([]);
  });

  it('url картинки экранируется в HTML-атрибуте (защита от вырывания из атрибута)', () => {
    const res = renderBubble({ out: true }, { kind: 'image', url: 'https://host/pic.jpg?x="><script>' }, ctx);
    expect(res.html).not.toContain('<script>');
  });
});
