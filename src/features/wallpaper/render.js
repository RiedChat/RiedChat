// ===================== features/wallpaper/render.js =====================
// Применение обоев к #messages и пересчёт фиксированного background-size при resize. Хранение - storage.js, UI - modal.js.
import { $, debounce } from '../../core/dom-utils.js';
import { dataUrlOf } from '../../core/image-utils.js';

import { wallpaperStore } from './storage.js';

// Применяет сохранённые обои; вызывается при входе (connection.js:onLoggedIn) и после сохранения в профиле.
export function applyWallpaper(){
  const messagesEl = $('messages');
  if(!messagesEl) return;
  const wallpaper = wallpaperStore.get();
  if(wallpaper && wallpaper.b64){
    messagesEl.style.backgroundImage = `url(${dataUrlOf(wallpaper.b64, wallpaper.type)})`;
    applyWallpaperSizing(messagesEl, wallpaper);
  } else {
    messagesEl.style.backgroundImage = '';
    messagesEl.style.backgroundSize = '';
  }
}

// Считает background-size вручную и ставит ФИКСИРОВАННЫМИ px (не "cover" в CSS).
//
// Проблема: "cover" пересчитывается на каждый reflow. #messages меняет высоту при открытии/закрытии клавиатуры
// (features/viewport.js, --app-vh), и обои мерцают/сдвигаются.
// Решение: считаем "cover" один раз от СТАБИЛЬНЫХ window.innerWidth/innerHeight (layout viewport, на большинстве
// мобильных браузеров не уменьшается клавиатурой, в отличие от visualViewport) и пересчитываем только на настоящий resize (поворот, ресайз окна).
// Последние размеры окна нужны, чтобы отличить resize от клавиатуры (см. обработчик resize ниже).
let lastWallpaperW = window.innerWidth;
let lastWallpaperH = window.innerHeight;

function applyWallpaperSizing(messagesEl, wallpaper){
  const img = new Image();
  img.onload = () => {
    // Пока грузилась картинка, обои могли смениться или сброситься - не перетираем более новое состояние.
    const current = wallpaperStore.get();
    if(!current || current.b64 !== wallpaper.b64) return;
    const boxW = window.innerWidth || document.documentElement.clientWidth || 1;
    const boxH = window.innerHeight || document.documentElement.clientHeight || 1;
    lastWallpaperW = boxW; lastWallpaperH = boxH;
    const scale = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight) || 1;
    const w = Math.ceil(img.naturalWidth * scale);
    const h = Math.ceil(img.naturalHeight * scale);
    messagesEl.style.backgroundSize = w + 'px ' + h + 'px';
  };
  img.src = dataUrlOf(wallpaper.b64, wallpaper.type);
}

// Пересчитываем размер только на настоящий window resize (поворот, ресайз окна); на window.visualViewport специально не подписываемся.
//
// На iOS Safari innerHeight с клавиатурой не меняется, но на многих Android-браузерах уменьшается, и resize срабатывает от клавиатуры.
// Отличаем по ширине: клавиатура меняет только высоту и только уменьшает. Ширина та же, а высота меньше - это клавиатура, размер не трогаем.
const recalcWallpaperSizing = debounce(() => {
  const w = window.innerWidth, h = window.innerHeight;
  const widthChanged = w !== lastWallpaperW;
  const grewTaller = h > lastWallpaperH;
  if(!widthChanged && !grewTaller) return; // похоже на клавиатуру (Android) - не пересчитываем
  lastWallpaperW = w; lastWallpaperH = h;
  const wallpaper = wallpaperStore.get();
  const messagesEl = $('messages');
  if(wallpaper && wallpaper.b64 && messagesEl) applyWallpaperSizing(messagesEl, wallpaper);
}, 200);
window.addEventListener('resize', recalcWallpaperSizing);
