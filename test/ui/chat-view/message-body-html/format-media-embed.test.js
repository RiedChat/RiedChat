import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { loadVideoAutoDownloadEnabled } from '../../../../src/features/video-settings.js';
import { loadImageAutoDownloadEnabled } from '../../../../src/features/image-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';

const nextSeq = (() => { let n = 0; return () => n++; })();

describe('formatMessageBody: инлайн aesgcm-вложения', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.isStickerPack.mockReturnValue(false);
    media.getCached.mockReturnValue(undefined);
    loadVideoAutoDownloadEnabled.mockReturnValue(false);
    loadImageAutoDownloadEnabled.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
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

  it('пустые строки вокруг media-embed внутри текста схлопываются (не раздувают высоту пузыря)', () => {
    media.kindOf.mockReturnValue('image');
    const res = formatMessageBody('текст1\naesgcm://host/pic.jpg#ab12\nтекст2', { out: true, nextSeq });
    expect(res.bodyHtml).not.toContain('\n<div');
    expect(res.bodyHtml).not.toContain('</div>\n');
  });
});
