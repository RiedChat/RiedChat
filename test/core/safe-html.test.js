import { describe, it, expect } from 'vitest';
import { html, raw, setHTML } from '../../src/core/safe-html.js';

describe('html``', () => {
  it('экранирует подстановки по умолчанию', () => {
    const name = '<img src=x onerror=alert(1)>';
    const out = String(html`<b>${name}</b>`);
    expect(out).toBe('<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  });

  it('не экранирует значение, обёрнутое в raw()', () => {
    const trusted = raw('<i>ok</i>');
    const out = String(html`<div>${trusted}</div>`);
    expect(out).toBe('<div><i>ok</i></div>');
  });

  it('не экранирует вложенный html``', () => {
    const inner = html`<i>${'<x>'}</i>`;
    const out = String(html`<div>${inner}</div>`);
    expect(out).toBe('<div><i>&lt;x&gt;</i></div>');
  });

  it('экранирует каждый элемент массива и склеивает без разделителя', () => {
    const items = ['<a>', '<b>'];
    const out = String(html`${items}`);
    expect(out).toBe('&lt;a&gt;&lt;b&gt;');
  });

  it('null/undefined превращаются в пустую строку', () => {
    expect(String(html`x${null}y${undefined}z`)).toBe('xyz');
  });

  it('экранирует кавычки и амперсанд', () => {
    const s = `"quoted" & 'single'`;
    expect(String(html`${s}`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
  });
});

describe('setHTML', () => {
  it('принимает результат html`` и устанавливает innerHTML', () => {
    const el = document.createElement('div');
    setHTML(el, html`<span>${'<b>'}</span>`);
    expect(el.innerHTML).toBe('<span>&lt;b&gt;</span>');
  });

  it('null очищает innerHTML', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>old</p>';
    setHTML(el, null);
    expect(el.innerHTML).toBe('');
  });

  it('бросает исключение на сырую строку (не html``/raw)', () => {
    const el = document.createElement('div');
    expect(() => setHTML(el, '<script>alert(1)</script>')).toThrow();
  });
});
