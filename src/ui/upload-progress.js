// ===================== ui/upload-progress.js =====================
// Единственное место, трогающее DOM прогресс-бара загрузки (#upload-progress, #upload-label, #upload-bar, #upload-pct).
import { $ } from '../core/dom-utils.js';

// Показывает бар с подписью label и 0%.
export function show(label){
  $('upload-progress').hidden = false;
  $('upload-label').textContent = label;
  setPct(0);
}

export function setPct(pct){
  $('upload-bar').value = pct;
  $('upload-pct').textContent = pct + '%';
}

export const hide = () => { $('upload-progress').hidden = true; };
