import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUOTE_MARKER } from '../../../../src/core/text-patterns.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('formatMessageBody: блок цитаты', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.isStickerPack.mockReturnValue(false);
    media.getCached.mockReturnValue(undefined);
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('тело с блоком цитаты - вычленяет автора/текст цитаты в quoteHtml, rest - в bodyHtml', () => {
    const body = QUOTE_MARKER + '> Alice:\n> привет\n\nмой ответ';
    const res = formatMessageBody(body, { out: false, nextSeq });
    expect(res.quoteHtml).toContain('quote-author');
    expect(res.quoteHtml).toContain('Alice');
    expect(res.quoteHtml).toContain('привет');
    expect(res.bodyHtml).toBe('мой ответ');
  });

  it('автор/текст цитаты экранируются от HTML-инъекции', () => {
    const body = QUOTE_MARKER + '> <img onerror=alert(1)>:\n> <b>text</b>\n\nответ';
    const res = formatMessageBody(body, { out: false, nextSeq });
    expect(res.quoteHtml).not.toContain('<img onerror');
    expect(res.quoteHtml).not.toContain('<b>text</b>');
  });
});
