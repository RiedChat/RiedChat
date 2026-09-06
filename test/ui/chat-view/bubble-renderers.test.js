import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/net/media.js', () => ({
  media: { getCached: vi.fn(), isVideoNote: vi.fn(() => false), isSticker: vi.fn(() => false) },
}));
vi.mock('../../../src/ui/chat-view/message-body-html.js', () => ({ formatMessageBody: vi.fn() }));
vi.mock('../../../src/features/video-settings.js', () => ({ loadVideoAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/features/video-note-settings.js', () => ({ loadVideoNoteAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/features/image-settings.js', () => ({ loadImageAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/features/sticker-settings.js', () => ({ loadStickerAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../src/net/trusted-contacts.js', () => ({ isTrustedContact: vi.fn(() => false) }));
vi.mock('../../../src/core/state.js', () => ({ state: { activeChat: 'alice@example.com' } }));
vi.mock('../../../src/i18n/t.js', () => ({ t: (key) => key }));

import { ticksHtml, renderBubble } from '../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../src/net/media.js';
import { formatMessageBody } from '../../../src/ui/chat-view/message-body-html.js';
import { loadImageAutoDownloadEnabled } from '../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../src/net/trusted-contacts.js';

const ctx = { lock: '', time: '<span>12:00</span>', ticks: '', nextSeq: (() => { let n = 0; return () => n++; })() };

describe('ticksHtml', () => {
  it('входящее сообщение (out:false) - пустая строка, галочек нет', () => {
    expect(ticksHtml({ out: false, status: 'read' })).toBe('');
  });

  it('своё сообщение без статуса read - одна галочка, без класса read', () => {
    const out = ticksHtml({ out: true, status: 'sent' });
    expect(out).toContain('✓');
    expect(out).not.toContain('✓✓');
    expect(out).not.toContain('read');
  });

  it('своё сообщение со статусом read - двойная галочка и класс read', () => {
    const out = ticksHtml({ out: true, status: 'read' });
    expect(out).toContain('✓✓');
    expect(out).toContain('class="ticks read"');
  });

  it('m == null/undefined - не падает, пустая строка', () => {
    expect(ticksHtml(null)).toBe('');
    expect(ticksHtml(undefined)).toBe('');
  });
});

describe('renderBubble - диспетчеризация по типу singleMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('singleMedia.kind === stickerpack - рисует карточку-плейсхолдер пака стикеров', () => {
    const res = renderBubble({ out: false }, { kind: 'stickerpack', url: 'http://x/pack.zip' }, ctx);
    expect(res.html).toContain('sticker-pack-bubble');
    expect(res.media).toEqual([{ type: 'stickerpack', id: expect.any(String), url: 'http://x/pack.zip' }]);
  });

  it('singleMedia.kind === audio - голосовой пузырь, media type voice', () => {
    const res = renderBubble({ out: false }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(res.html).toContain('voice-only');
    expect(res.media).toEqual([{ type: 'voice', id: expect.any(String), url: 'aesgcm://host/v.ogg#key' }]);
  });

  it('singleMedia.encrypted=true (не audio/stickerpack) - media-only пузырь, media type deferrable', () => {
    const res = renderBubble({ out: false }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(res.html).toContain('media-only');
    expect(res.media[0]).toMatchObject({ type: 'deferrable', url: 'aesgcm://host/v.mp4#key' });
  });

  it('своё исходящее зашифрованное вложение - holdOff всегда false (файл уже на руках)', () => {
    const res = renderBubble({ out: true }, { kind: 'video', url: 'aesgcm://host/v.mp4#key', encrypted: true }, ctx);
    expect(res.media[0].holdOff).toBe(false);
  });

  it('singleMedia без encrypted (открытая картинка) - plain image бабл, автозагрузка для своих сообщений', () => {
    const res = renderBubble({ out: true }, { kind: 'image', url: 'https://host/pic.jpg' }, ctx);
    expect(res.html).toContain('<img src="https://host/pic.jpg">');
    expect(res.media).toEqual([]);
  });

  it('чужая открытая картинка без включённой автозагрузки/доверия - плейсхолдер \"нажмите загрузить\", media непустой', () => {
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

  it('без singleMedia - текстовый пузырь через formatMessageBody', () => {
    const res = renderBubble({ out: false, body: 'привет' }, null, ctx);
    expect(formatMessageBody).toHaveBeenCalledWith('привет', { out: false, nextSeq: ctx.nextSeq });
    expect(res.html).toContain('привет');
  });

  it('текстовый пузырь с mediaPlaceholders - маппит kind=plain-image в media.type=plain-image, остальное в deferrable', () => {
    formatMessageBody.mockReturnValue({
      quoteHtml: '', bodyHtml: '',
      mediaPlaceholders: [
        { id: 'm1', url: 'u1', holdOff: false, kind: 'plain-image' },
        { id: 'm2', url: 'u2', holdOff: true, kind: 'video' },
      ],
    });
    const res = renderBubble({ out: false, body: 'x' }, null, ctx);
    expect(res.media).toEqual([
      { type: 'plain-image', id: 'm1', url: 'u1', holdOff: false },
      { type: 'deferrable', id: 'm2', url: 'u2', holdOff: true },
    ]);
  });

  it('исправленное сообщение (m.edited) - в текстовом пузыре появляется пометка edited', () => {
    const res = renderBubble({ out: false, body: 'x', edited: true }, null, ctx);
    expect(res.html).toContain('edited-tag');
  });
});
