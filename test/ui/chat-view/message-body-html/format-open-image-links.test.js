import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('formatMessageBody: открытые ссылки на картинки', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    autoload.video.load.mockReturnValue(false);
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('открытая ссылка на картинку от своего исходящего сообщения - грузится сразу (<img>)', () => {
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: true });
    expect(res.bodyHtml).toContain('<img src="https://host/pic.jpg">');
  });

  it('открытая ссылка на картинку от чужого, автозагрузка выключена - плейсхолдер вместо <img>', () => {
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: false });
    expect(res.bodyHtml).not.toContain('<img src=');
    expect(placeholdersOf(res.bodyHtml)).toEqual([{ type: 'plain-image', url: 'https://host/pic.jpg', holdOff: false }]);
  });

  it('открытая ссылка на картинку от чужого, автозагрузка включена И контакт доверенный - <img> сразу', () => {
    autoload.image.load.mockReturnValue(true);
    isTrustedContact.mockReturnValue(true);
    const res = formatMessageBody('вот фото https://host/pic.jpg', { out: false });
    expect(res.bodyHtml).toContain('<img src="https://host/pic.jpg">');
  });
});
