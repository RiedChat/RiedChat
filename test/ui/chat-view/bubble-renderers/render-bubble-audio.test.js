import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBubble } from '../../../../src/ui/chat-view/bubble-renderers.js';
import { media } from '../../../../src/net/media.js';
import { formatMessageBody } from '../../../../src/ui/chat-view/message-body-html.js';
import { ctx } from './_mocks.js';
import { placeholdersOf } from '../media-placeholders-of.js';

describe('renderBubble - audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.getCached.mockReturnValue(undefined);
    formatMessageBody.mockReturnValue({ quoteHtml: '', bodyHtml: 'привет' });
  });

  it('singleMedia.kind === audio - голосовой пузырь, media type deferrable, holdOff по настройке автозагрузки', () => {
    const res = renderBubble({ out: false }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(String(res.html)).toContain('voice-only');
    expect(placeholdersOf(res.html)).toEqual([{ type: 'deferrable', url: 'aesgcm://host/v.ogg#key', holdOff: false }]);
  });

  it('чужое голосовое без включённой автозагрузки - holdOff:true, плейсхолдер "нажмите, чтобы загрузить"', async () => {
    const { autoload } = await import('../../../../src/features/autoload-settings.js');
    autoload.audio.load.mockReturnValue(false);
    const res = renderBubble({ out: false }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(String(res.html)).toContain('video-tap-load');
    expect(placeholdersOf(res.html)[0].holdOff).toBe(true);
    autoload.audio.load.mockReturnValue(true);
  });

  it('своё исходящее голосовое - holdOff всегда false, даже если автозагрузка выключена', async () => {
    const { autoload } = await import('../../../../src/features/autoload-settings.js');
    autoload.audio.load.mockReturnValue(false);
    const res = renderBubble({ out: true }, { kind: 'audio', url: 'aesgcm://host/v.ogg#key' }, ctx);
    expect(placeholdersOf(res.html)[0].holdOff).toBe(false);
    autoload.audio.load.mockReturnValue(true);
  });
});
