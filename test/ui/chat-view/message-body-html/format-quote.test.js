import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUOTE_MARKER } from '../../../../src/core/text-patterns.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('formatMessageBody: блок цитаты', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    autoload.video.load.mockReturnValue(false);
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('тело с блоком цитаты - вычленяет автора/текст цитаты в quoteHtml, rest - в bodyHtml', () => {
    const body = QUOTE_MARKER + '> Alice:\n> привет\n\nмой ответ';
    const res = formatMessageBody(body, { out: false });
    expect(res.quoteHtml).toContain('quote-author');
    expect(res.quoteHtml).toContain('Alice');
    expect(res.quoteHtml).toContain('привет');
    expect(res.bodyHtml).toBe('мой ответ');
  });

  it('цитата с зашифрованным фото: миниатюра - quote-thumb с data-media-*, свои сообщения без плашки', () => {
    const body = QUOTE_MARKER + '> Alice:\n> aesgcm://host/pic.jpg#ab12\n\nответ';
    const res = formatMessageBody(body, { out: true });
    expect(placeholdersOf(res.quoteHtml)).toEqual([{ type: 'quote-thumb', url: 'aesgcm://host/pic.jpg#ab12', holdOff: false }]);
    expect(res.quoteHtml).not.toContain('video-tap-load');
  });

  it('цитата с зашифрованным фото от чужого без автозагрузки - плашка «нажмите» и data-hold=true', () => {
    const body = QUOTE_MARKER + '> Alice:\n> aesgcm://host/pic.jpg#ab12\n\nответ';
    const res = formatMessageBody(body, { out: false });
    expect(placeholdersOf(res.quoteHtml)).toEqual([{ type: 'quote-thumb', url: 'aesgcm://host/pic.jpg#ab12', holdOff: true }]);
    expect(res.quoteHtml).toContain('video-tap-load');
  });

  it('автор/текст цитаты экранируются от HTML-инъекции', () => {
    const body = QUOTE_MARKER + '> <img onerror=alert(1)>:\n> <b>text</b>\n\nответ';
    const res = formatMessageBody(body, { out: false });
    expect(res.quoteHtml).not.toContain('<img onerror');
    expect(res.quoteHtml).not.toContain('<b>text</b>');
  });
});
