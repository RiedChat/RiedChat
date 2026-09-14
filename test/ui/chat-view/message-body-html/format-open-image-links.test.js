import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('formatMessageBody: открытые ссылки на картинки', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.isStickerPack.mockReturnValue(false);
    media.getCached.mockReturnValue(undefined);
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('открытая ссылка на картинку от своего исходящего сообщения - грузится сразу (<img>)', () => {
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: true, nextSeq });
    expect(res.bodyHtml).toContain('<img src="https://host/pic.jpg">');
  });

  it('открытая ссылка на картинку от чужого, автозагрузка выключена - плейсхолдер вместо <img>', () => {
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: false, nextSeq });
    expect(res.bodyHtml).not.toContain('<img src=');
    expect(res.mediaPlaceholders.some(p => p.kind === 'plain-image')).toBe(true);
  });

  it('открытая ссылка на картинку от чужого, автозагрузка включена И контакт доверенный - <img> сразу', () => {
    loadImageAutoDownloadEnabled.mockReturnValue(true);
    isTrustedContact.mockReturnValue(true);
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: false, nextSeq });
    expect(res.bodyHtml).toContain('<img src="https://host/pic.jpg">');
  });
});
