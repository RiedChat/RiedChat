import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySingleMedia } from '../../../../src/ui/chat-view/message-body-html.js';
import { media } from '../../../../src/net/media.js';

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

  it('aesgcm-ссылка kind=file, но не пак стикеров - {encrypted:true, kind:file}', () => {
    media.kindOf.mockReturnValue('file');
    media.isStickerPack.mockReturnValue(false);
    const url = 'aesgcm://host/doc.pdf#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'file', url });
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
