import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUOTE_MARKER } from '../../../src/core/text-patterns.js';

vi.mock('../../../src/net/media.js', () => ({
  media: {
    AESGCM_RE: /aesgcm:\/\/[^\s#]+#[0-9a-fA-F]+/g,
    kindOf: vi.fn(),
    extOf: vi.fn((url) => (url.split('.').pop() || '').split('#')[0]),
    isAesgcm: (url) => /^aesgcm:\/\//i.test(url),
    isStickerPack: vi.fn(() => false),
    isVideoNote: vi.fn(() => false),
    getCached: vi.fn(() => undefined),
    extractThumbDataUrl: vi.fn(() => null),
  },
}));
vi.mock('../../../src/features/message-swipe.js', () => ({ mediaLabel: vi.fn((kind) => '[' + kind + ']') }));
vi.mock('../../../src/features/video-settings.js', () => ({ loadVideoAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/features/image-settings.js', () => ({ loadImageAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/net/trusted-contacts.js', () => ({ isTrustedContact: vi.fn(() => false) }));
vi.mock('../../../src/core/state.js', () => ({ state: { activeChat: 'alice@example.com' } }));
vi.mock('../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { classifySingleMedia, formatMessageBody } from '../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('classifySingleMedia', () => {
  beforeEach(() => { vi.clearAllMocks(); media.isStickerPack.mockReturnValue(false); });

  it('пустое/пробельное тело - null', () => {
    expect(classifySingleMedia('')).toBeNull();
    expect(classifySingleMedia('   ')).toBeNull();
    expect(classifySingleMedia(null)).toBeNull();
  });

  it('одна aesgcm-ссылка на изображение (без сопровождающего текста) - {encrypted:true, kind:image}', () => {
    media.kindOf.mockReturnValue('image');
    const url = 'aesgcm://host/pic.jpg#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'image', url });
  });

  it('aesgcm-ссылка + сопровождающий текст - не single-media (null)', () => {
    media.kindOf.mockReturnValue('image');
    expect(classifySingleMedia('смотри aesgcm://host/pic.jpg#abcd1234')).toBeNull();
  });

  it('aesgcm-ссылка kind=file и isStickerPack=true - {encrypted:true, kind:stickerpack}', () => {
    media.kindOf.mockReturnValue('file');
    media.isStickerPack.mockReturnValue(true);
    const url = 'aesgcm://host/stickers.zip#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'stickerpack', url });
  });

  it('aesgcm-ссылка kind=file, но не пак стикеров - null (голый файл не рендерим как single-media)', () => {
    media.kindOf.mockReturnValue('file');
    media.isStickerPack.mockReturnValue(false);
    expect(classifySingleMedia('aesgcm://host/doc.pdf#abcd1234')).toBeNull();
  });

  it('одна открытая ссылка на картинку (.jpg) - {encrypted:false, kind:image}', () => {
    const url = 'https://host/pic.jpg';
    expect(classifySingleMedia(url)).toEqual({ encrypted: false, kind: 'image', url });
  });

  it('открытая ссылка на .zip-пак стикеров (не aesgcm) - {encrypted:false, kind:stickerpack}', () => {
    media.isStickerPack.mockReturnValue(true);
    const url = 'https://host/stickers.zip';
    expect(classifySingleMedia(url)).toEqual({ encrypted: false, kind: 'stickerpack', url });
  });

  it('открытая ссылка, не картинка и не пак стикеров - null', () => {
    expect(classifySingleMedia('https://host/page.html')).toBeNull();
  });

  it('несколько ссылок в теле - не single-media, null', () => {
    expect(classifySingleMedia('https://a.com/1.jpg https://a.com/2.jpg')).toBeNull();
  });
});

describe('formatMessageBody', () => {
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

  it('инлайн aesgcm-ссылка в тексте заменяется на media-embed плейсхолдер и попадает в mediaPlaceholders', () => {
    media.kindOf.mockReturnValue('image');
    const res = formatMessageBody('смотри: aesgcm://host/pic.jpg#ab12', { out: true, nextSeq });
    expect(res.bodyHtml).toContain('media-embed');
    expect(res.mediaPlaceholders).toHaveLength(1);
    expect(res.mediaPlaceholders[0].url).toBe('aesgcm://host/pic.jpg#ab12');
  });

  it('аудио-вложение получает класс audio-embed (для компактного плеера)', () => {
    media.kindOf.mockReturnValue('audio');
    const res = formatMessageBody('aesgcm://host/voice.ogg#ab12', { out: true, nextSeq });
    expect(res.bodyHtml).toContain('audio-embed');
  });

  it('чужое видео без автозагрузки и без кэша - holdOff:true, рисуется как "нажмите загрузить"', () => {
    media.kindOf.mockReturnValue('video');
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: false, nextSeq });
    expect(res.mediaPlaceholders[0].holdOff).toBe(true);
    expect(res.bodyHtml).toContain('video-tap-load');
  });

  it('своё исходящее видео - holdOff:false (не ждём тапа для собственного вложения)', () => {
    media.kindOf.mockReturnValue('video');
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: true, nextSeq });
    expect(res.mediaPlaceholders[0].holdOff).toBe(false);
  });

  it('видео уже есть в кэше (status:done) - holdOff:false, даже если автозагрузка выключена', () => {
    media.kindOf.mockReturnValue('video');
    media.getCached.mockReturnValue({ status: 'done' });
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: false, nextSeq });
    expect(res.mediaPlaceholders[0].holdOff).toBe(false);
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

  it('обычная (не картиночная) http-ссылка становится кликабельной <a>, текст не теряется', () => {
    const res = formatMessageBody('см. https://host/page.html тут', { out: true, nextSeq });
    expect(res.bodyHtml).toContain('<a href="https://host/page.html" target="_blank" rel="noopener">https://host/page.html</a>');
  });

  it('пустые строки вокруг media-embed внутри текста схлопываются (не раздувают высоту пузыря)', () => {
    media.kindOf.mockReturnValue('image');
    const res = formatMessageBody('текст1\naesgcm://host/pic.jpg#ab12\nтекст2', { out: true, nextSeq });
    expect(res.bodyHtml).not.toContain('\n<div');
    expect(res.bodyHtml).not.toContain('</div>\n');
  });
});
