// test/setup/dialog.js
// jsdom не реализует showModal()/close() у <dialog> и отправку <form method="dialog">. Минимальная эмуляция поведения браузера:
// showModal ставит open, close(value) снимает open, пишет returnValue и шлёт событие close, клик по кнопке формы method=dialog закрывает диалог со значением кнопки.
const proto = globalThis.HTMLDialogElement?.prototype;
if(proto && !proto.showModal){
  proto.showModal = function(){
    if(this.open) throw new DOMException('already open', 'InvalidStateError');
    this.setAttribute('open', '');
  };
  proto.close = function(returnValue){
    if(!this.open) return;
    if(returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('form[method="dialog"] button');
    if(btn) btn.closest('dialog')?.close(btn.value);
  });
}
