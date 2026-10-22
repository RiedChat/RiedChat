import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';
import { autoload } from '../../../../src/features/autoload-settings.js';
import { isTrustedContact } from '../../../../src/net/trusted-contacts.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('formatMessageBody: инлайн aesgcm-вложения', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    autoload.video.load.mockReturnValue(false);
    autoload.image.load.mockReturnValue(false);
    isTrustedContact.mockReturnValue(false);
  });

  it('инлайн aesgcm-ссылка в тексте заменяется на media-embed плейсхолдер с data-media-*', () => {
    const res = formatMessageBody('смотри: aesgcm://host/pic.jpg#ab12', { out: true });
    expect(res.bodyHtml).toContain('media-embed');
    const found = placeholdersOf(res.bodyHtml);
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe('aesgcm://host/pic.jpg#ab12');
  });

  it('url с & в плейсхолдере не искажается (в атрибут идёт экранированным, dataset отдаёт исходную ссылку)', () => {
    const res = formatMessageBody('aesgcm://host/pic.jpg?a=1&b=2#ab12', { out: true });
    expect(placeholdersOf(res.bodyHtml)[0].url).toBe('aesgcm://host/pic.jpg?a=1&b=2#ab12');
  });

  it('аудио-вложение получает класс audio-embed (для компактного плеера)', () => {
    const res = formatMessageBody('aesgcm://host/voice.ogg#ab12', { out: true });
    expect(res.bodyHtml).toContain('audio-embed');
  });

  it('чужое видео без автозагрузки и без кэша - holdOff:true, рисуется как "нажмите загрузить"', () => {
    autoload.video.load.mockReturnValue(false);
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: false });
    expect(placeholdersOf(res.bodyHtml)[0].holdOff).toBe(true);
    expect(res.bodyHtml).toContain('video-tap-load');
  });

  it('своё исходящее видео - holdOff:false (не ждём тапа для собственного вложения)', () => {
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: true });
    expect(placeholdersOf(res.bodyHtml)[0].holdOff).toBe(false);
  });

  it('видео уже есть в кэше (status:done) - holdOff:false, даже если автозагрузка выключена', () => {
    media.getCached.mockReturnValue({ status: 'done' });
    const res = formatMessageBody('aesgcm://host/v.mp4#ab12', { out: false });
    expect(placeholdersOf(res.bodyHtml)[0].holdOff).toBe(false);
  });

  it('пустые строки вокруг media-embed внутри текста схлопываются (не раздувают высоту пузыря)', () => {
    const res = formatMessageBody('текст1\naesgcm://host/pic.jpg#ab12\nтекст2', { out: true });
    expect(res.bodyHtml).not.toContain('\n<div');
    expect(res.bodyHtml).not.toContain('</div>\n');
  });
});
