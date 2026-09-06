import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { confirm } from '../../src/ui/modals.js';

function mountModal(){
  document.body.innerHTML = `
    <div id="confirm-modal">
      <div class="modal-box">
        <h3 id="confirm-title"></h3>
        <p id="confirm-desc"></p>
        <button id="confirm-ok"></button>
        <button id="confirm-cancel"></button>
      </div>
    </div>
  `;
}

describe('modals.confirm', () => {
  beforeEach(() => { mountModal(); });

  it('резолвится в true по клику на confirm-ok и выставляет active/тексты', async () => {
    const promise = confirm('Удалить чат?', 'Это необратимо');
    expect(document.getElementById('confirm-title').textContent).toBe('Удалить чат?');
    expect(document.getElementById('confirm-desc').textContent).toBe('Это необратимо');
    expect(document.getElementById('confirm-modal').classList.contains('active')).toBe(true);

    fireEvent.click(document.getElementById('confirm-ok'));
    await expect(promise).resolves.toBe(true);
    expect(document.getElementById('confirm-modal').classList.contains('active')).toBe(false);
  });

  it('резолвится в false по клику на confirm-cancel', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(document.getElementById('confirm-cancel'));
    await expect(promise).resolves.toBe(false);
  });

  it('резолвится в false по клику на затемнённый фон (overlay)', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(document.getElementById('confirm-modal'));
    await expect(promise).resolves.toBe(false);
  });

  it('клик внутри modal-box (не по overlay) НЕ закрывает модалку', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(document.querySelector('.modal-box'));
    expect(document.getElementById('confirm-modal').classList.contains('active')).toBe(true);
    fireEvent.click(document.getElementById('confirm-ok'));
    await expect(promise).resolves.toBe(true);
  });

  it('okDanger=false снимает деструктивный стиль с кнопки', async () => {
    const promise = confirm('Отправить без шифрования?', '', { okDanger: false, okText: 'Отправить' });
    const okBtn = document.getElementById('confirm-ok');
    expect(okBtn.textContent).toBe('Отправить');
    expect(okBtn.style.background).toBe('');
    fireEvent.click(okBtn);
    await promise;
  });
});
