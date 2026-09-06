// ===================== core/timing.js =====================
// throttle/debounce для частых событий (presence-бёрсты при реконнекте,
// resize/scroll visualViewport, ввод в composer и т.п.), чтобы не гонять
// тяжёлые перерисовки/сеть на каждое отдельное срабатывание.

// debounce: откладывает вызов fn до тех пор, пока события не перестанут
// сыпаться на wait мс - подходит для "успокоившегося" состояния (конец
// пачки presence-стэнз, конец ресайза окна).
export function debounce(fn, wait){
  let timer = null;
  function debounced(...args){
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  }
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// throttle: вызывает fn не чаще одного раза в wait мс - первый вызов сразу,
// остальные в течение окна схлопываются в один финальный (trailing), чтобы
// не терять последнее состояние (например, финальную высоту после resize).
export function throttle(fn, wait){
  let lastCall = 0;
  let timer = null;
  let pendingArgs = null;
  function invoke(context){
    lastCall = Date.now();
    timer = null;
    fn.apply(context, pendingArgs);
    pendingArgs = null;
  }
  function throttled(...args){
    const now = Date.now();
    const remaining = wait - (now - lastCall);
    pendingArgs = args;
    if(remaining <= 0){
      clearTimeout(timer);
      invoke(this);
    } else if(!timer){
      timer = setTimeout(() => invoke(this), remaining);
    }
  }
  throttled.cancel = () => { clearTimeout(timer); timer = null; pendingArgs = null; };
  return throttled;
}
