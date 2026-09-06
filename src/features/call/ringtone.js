// ===================== features/call/ringtone.js =====================
// Гудок/вибрация на входящий звонок.
let _ringtoneCtx = null;
let _ringtoneTimer = null;

export function startRingtone(){
  stopRingtone();
  try{
    _ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      if(!_ringtoneCtx) return;
      const osc = _ringtoneCtx.createOscillator();
      const gain = _ringtoneCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(_ringtoneCtx.destination);
      const t0 = _ringtoneCtx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    };
    beep();
    _ringtoneTimer = setInterval(beep, 1500);
  }catch(e){
    console.warn('startRingtone: WebAudio недоступен', e);
  }
  if(navigator.vibrate){
    // Повторяющийся паттерн (вибро/пауза), пока звонок не примут/не отклонят/
    // не отменят - вызов stopRingtone() (navigator.vibrate(0)) прерывает его.
    navigator.vibrate([400, 200, 400, 1000]);
  }
}

export function stopRingtone(){
  if(_ringtoneTimer){ clearInterval(_ringtoneTimer); _ringtoneTimer = null; }
  if(_ringtoneCtx){ _ringtoneCtx.close().catch(() => {}); _ringtoneCtx = null; }
  if(navigator.vibrate) navigator.vibrate(0);
}
