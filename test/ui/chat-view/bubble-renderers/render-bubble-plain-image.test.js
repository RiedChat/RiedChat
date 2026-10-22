import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';
import { ctx } from './_mocks.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('renderBubble - открытая картинка', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет' });
  });

  it('singleMedia без encrypted (открытая картинка) - plain image бабл, автозагрузка для своих сообщений', () => {
    const res = renderBubble({ out: true }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(String(res.html)).toContain('<img src="https://host/pic.jpg">');
    expect(placeholdersOf(res.html)).toEqual([]);
  });

  it('чужая открытая картинка без включённой автозагрузки/доверия - плейсхолдер "нажмите загрузить" с data-media-*', () => {
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
    const res = renderBubble({ out: false }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(String(res.html)).not.toContain('<img src=');
    expect(placeholdersOf(res.html)).toEqual([{ type: 'plain-image', url: 'https://host/pic.jpg', holdOff: false }]);
  });

  it('чужая открытая картинка, автозагрузка включена И контакт доверенный - грузит сразу', () => {
    autoload.image.load.mockReturnValue(true);
    isTrustedContact.mockReturnValue(true);
    const res = renderBubble({ out: false }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(String(res.html)).toContain('<img src="https://host/pic.jpg">');
    expect(placeholdersOf(res.html)).toEqual([]);
  });

  it('url картинки экранируется в HTML-атрибуте (защита от вырывания из атрибута)', () => {
    const res = renderBubble({ out: true }, { kind: 'image', url: 'https://host/pic.jpg?x="><script>' }, ctx);
    expect(String(res.html)).not.toContain('<script>');
  });
});
