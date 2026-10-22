import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { confirmDialog as confirm } from '../../src/ui/confirm-modal.js';

function mountModal(){
  document.body.innerHTML = `
    <dialog id="confirm-modal">
      <div class="modal-box">
        <h3 id="confirm-title"></h3>
        <p id="confirm-desc"></p>
        <form method="dialog" class="modal-actions">
          <button id="confirm-cancel" value="cancel"></button>
          <button id="confirm-ok" value="ok"></button>
        </form>
      </div>
    </dialog>
  `;
}

const dlg = () => document.getElementById('confirm-modal');

describe('confirm-modal.confirmDialog', () => {
  beforeEach(() => { mountModal(); });

  it('резолвится в true по клику на confirm-ok, выставляет тексты и закрывает диалог', async () => {
    const promise = confirm('Удалить чат?', 'Это необратимо');
    expect(document.getElementById('confirm-title').textContent).toBe('Удалить чат?');
    expect(document.getElementById('confirm-desc').textContent).toBe('Это необратимо');
    expect(dlg().open).toBe(true);

    fireEvent.click(document.getElementById('confirm-ok'));
    await expect(promise).resolves.toBe(true);
    expect(dlg().open).toBe(false);
  });

  it('резолвится в false по клику на confirm-cancel', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(document.getElementById('confirm-cancel'));
    await expect(promise).resolves.toBe(false);
  });

  it('резолвится в false по клику на фон (::backdrop даёт click с target === dialog)', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(dlg());
    await expect(promise).resolves.toBe(false);
    expect(dlg().open).toBe(false);
  });

  it('клик внутри modal-box (не по фону) НЕ закрывает модалку', async () => {
    const promise = confirm('Выйти?');
    fireEvent.click(document.querySelector('.modal-box'));
    expect(dlg().open).toBe(true);
    fireEvent.click(document.getElementById('confirm-ok'));
    await expect(promise).resolves.toBe(true);
  });

  it('Escape (close() без значения) - false', async () => {
    const promise = confirm('Выйти?');
    dlg().close();
    await expect(promise).resolves.toBe(false);
  });

  it('returnValue прошлого открытия не просачивается: после ok Escape во втором вызове - false', async () => {
    const first = confirm('Удалить?');
    fireEvent.click(document.getElementById('confirm-ok'));
    await expect(first).resolves.toBe(true);

    const second = confirm('Удалить ещё?');
    dlg().close();
    await expect(second).resolves.toBe(false);
  });

  it('okDanger=false снимает деструктивный стиль с кнопки', async () => {
    const promise = confirm('Отправить без шифрования?', '', { okDanger: false, okText: 'Отправить' });
    const okBtn = document.getElementById('confirm-ok');
    expect(okBtn.textContent).toBe('Отправить');
    expect(okBtn.classList.contains('danger')).toBe(false);
    fireEvent.click(okBtn);
    await promise;
  });

  it('по умолчанию кнопка подтверждения деструктивная (класс danger)', async () => {
    const promise = confirm('Удалить чат?');
    const okBtn = document.getElementById('confirm-ok');
    expect(okBtn.classList.contains('danger')).toBe(true);
    fireEvent.click(okBtn);
    await promise;
  });
});
