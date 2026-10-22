import './_mocks.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySingleMedia } from '../../../../src/ui/chat-view/message-body-html.js';

describe('classifySingleMedia', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('пустое/пробельное тело - null', () => {
    expect(classifySingleMedia('')).toBeNull();
    expect(classifySingleMedia('   ')).toBeNull();
    expect(classifySingleMedia(null)).toBeNull();
  });

  it('одна aesgcm-ссылка на изображение (без сопровождающего текста) - {encrypted:true, kind:image}', () => {
    const url = 'aesgcm://host/pic.jpg#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'image', url });
  });

  it('aesgcm-ссылка + сопровождающий текст - не single-media (null)', () => {
    expect(classifySingleMedia('смотри aesgcm://host/pic.jpg#abcd1234')).toBeNull();
  });

  it('aesgcm-ссылка на stickers.json (kind=file) - {encrypted:true, kind:stickerpack}', () => {
    const url = 'aesgcm://host/stickers.json#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'stickerpack', url });
  });

  it('aesgcm-ссылка kind=file (doc.pdf), не пак стикеров - {encrypted:true, kind:file}', () => {
    const url = 'aesgcm://host/doc.pdf#abcd1234';
    expect(classifySingleMedia(url)).toEqual({ encrypted: true, kind: 'file', url });
  });

  it('одна открытая ссылка на картинку (.jpg) - {encrypted:false, kind:image}', () => {
    const url = 'https://host/pic.jpg';
    expect(classifySingleMedia(url)).toEqual({ encrypted: false, kind: 'image', url });
  });

  it('открытая ссылка на .json-пак стикеров (не aesgcm) - {encrypted:false, kind:stickerpack}', () => {
    const url = 'https://host/stickers.json';
    expect(classifySingleMedia(url)).toEqual({ encrypted: false, kind: 'stickerpack', url });
  });

  it('открытая ссылка, не картинка и не пак стикеров - null', () => {
    expect(classifySingleMedia('https://host/page.html')).toBeNull();
  });

  it('несколько ссылок в теле - не single-media, null', () => {
    expect(classifySingleMedia('https://a.com/1.jpg https://a.com/2.jpg')).toBeNull();
  });
});
