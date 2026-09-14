import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';

describe('renderBubble - audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    media.isVideoNote.mockReturnValue(false);
    media.isSticker.mockReturnValue(false);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет', mediaPlaceholders: [] });
  });

  it('singleMedia.kind === audio - голосовой пузырь, media type deferrable, holdOff по настройке автозагрузки', () => {
    const res = renderBubble({ out: false }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(res.html).toContain('voice-only');
    expect(res.media).toEqual([{ type: 'deferrable', id: expect.any(String), url: 'aesgcm://host/v.ogg#key', holdOff: false }]);
  });

  it('чужое голосовое без включённой автозагрузки - holdOff:true, плейсхолдер "нажмите, чтобы загрузить"', async () => {
    const { loadAudioAutoDownloadEnabled } = await import('../../../../src/features/audio-settings.js');
    loadAudioAutoDownloadEnabled.mockReturnValue(false);
    const res = renderBubble({ out: false }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(res.html).toContain('video-tap-load');
    expect(res.media[0].holdOff).toBe(true);
    loadAudioAutoDownloadEnabled.mockReturnValue(true);
  });

  it('своё исходящее голосовое - holdOff всегда false, даже если автозагрузка выключена', async () => {
    const { loadAudioAutoDownloadEnabled } = await import('../../../../src/features/audio-settings.js');
    loadAudioAutoDownloadEnabled.mockReturnValue(false);
    const res = renderBubble({ out: true }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(res.media[0].holdOff).toBe(false);
    loadAudioAutoDownloadEnabled.mockReturnValue(true);
  });
});
