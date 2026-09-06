// ===================== features/wallpaper/render.js =====================
// Применение сохранённых обоев к DOM (#messages) и пересчёт фиксированного
// background-size при resize окна. Хранение - в storage.js, UI модалки - в
// modal.js.
import { $ } from '../../core/dom-utils.js';
import { loadWallpaper } from './storage.js';
import { debounce } from '../../core/timing.js';

// Применяет сохранённые обои к списку сообщений - вызывается при входе
// (connection.js:onLoggedIn) и сразу после сохранения в модалке профиля.
export function applyWallpaper(){
    const messagesEl = $('messages');
    if(!messagesEl) return;
    const wallpaper = loadWallpaper();
    if(wallpaper && wallpaper.b64){
      messagesEl.style.backgroundImage = `url(data:${wallpaper.type || 'image/jpeg'};base64,${wallpaper.b64})`;
      applyWallpaperSizing(messagesEl, wallpaper);
    } else {
      messagesEl.style.backgroundImage = '';
      messagesEl.style.backgroundSize = '';
    }
}

  // Считает background-size вручную и проставляет его ФИКСИРОВАННЫМИ пикселями
  // (а не оставляет "cover" в CSS).
  //
  // ПРОБЛЕМА: "cover" - это не разовое вычисление, браузер пересчитывает его
  // на каждый layout-reflow элемента. #messages при открытии/закрытии
  // экранной клавиатуры физически меняет высоту (см. features/viewport.js -
  // --app-vh уменьшается под visualViewport), а значит на каждый кадр этой
  // анимации "cover" заново пересчитывает размер и позицию картинки - отсюда
  // заметное мерцание/сдвиг обоев ровно в момент появления клавиатуры.
  //
  // РЕШЕНИЕ: считаем размер "cover" один раз сами, но не от текущей (может
  // быть уже сжатой клавиатурой) высоты #messages, а от СТАБИЛЬНЫХ размеров
  // окна (window.innerWidth/innerHeight - это "layout viewport", который, как
  // и объяснено в features/viewport.js, на большинстве мобильных браузеров
  // НЕ уменьшается при появлении клавиатуры, в отличие от visualViewport).
  // Получившийся размер проставляем как обычные px - он не меняется, пока
  // пользователь просто открывает/закрывает клавиатуру, поэтому обои не
  // "дёргаются". Пересчитываем эту величину только по-настоящему редким
  // событиям (window resize - поворот экрана, ресайз окна браузера).
  // Последние размеры окна, для которых мы считали фиксированный размер обоев -
  // используются, чтобы отличить настоящий resize/поворот экрана от открытия
  // клавиатуры (см. подробный комментарий у обработчика resize ниже).
  let lastWallpaperW = window.innerWidth;
  let lastWallpaperH = window.innerHeight;

  function applyWallpaperSizing(messagesEl, wallpaper){
    const img = new Image();
    img.onload = () => {
      // К моменту завершения загрузки картинки пользователь мог успеть сменить
      // обои ещё раз или вовсе их сбросить - не перетираем более новое состояние.
      const current = loadWallpaper();
      if(!current || current.b64 !== wallpaper.b64) return;
      const boxW = window.innerWidth || document.documentElement.clientWidth || 1;
      const boxH = window.innerHeight || document.documentElement.clientHeight || 1;
      lastWallpaperW = boxW; lastWallpaperH = boxH;
      const scale = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight) || 1;
      const w = Math.ceil(img.naturalWidth * scale);
      const h = Math.ceil(img.naturalHeight * scale);
      messagesEl.style.backgroundSize = w + 'px ' + h + 'px';
    };
    img.src = `data:${wallpaper.type || 'image/jpeg'};base64,${wallpaper.b64}`;
  }

  // Пересчитываем зафиксированный размер обоев только на настоящий resize
  // окна (поворот экрана, ресайз десктопного окна браузера) - специально НЕ
  // подписываемся на window.visualViewport, чтобы открытие/закрытие
  // клавиатуры на телефоне это не задевало (см. комментарий выше).
  //
  // ВАЖНО: на iOS Safari window.innerHeight при появлении клавиатуры не
  // меняется (там достаточно было бы просто не трогать размер вовсе), но на
  // многих Android-браузерах innerHeight реально уменьшается вместе с
  // видимой областью - обычный window resize срабатывает и на клавиатуру
  // тоже. Отличаем такой "resize от клавиатуры" по ширине: клавиатура
  // никогда не меняет ширину окна, только высоту, и всегда её УМЕНЬШАЕТ. Если
  // ширина не изменилась и высота стала МЕНЬШЕ прежней - считаем, что это
  // клавиатура, и не трогаем зафиксированный размер обоев.
  const recalcWallpaperSizing = debounce(() => {
    const w = window.innerWidth, h = window.innerHeight;
    const widthChanged = w !== lastWallpaperW;
    const grewTaller = h > lastWallpaperH;
    if(!widthChanged && !grewTaller) return; // похоже на открытие клавиатуры (Android) - не пересчитываем
    lastWallpaperW = w; lastWallpaperH = h;
    const wallpaper = loadWallpaper();
    const messagesEl = $('messages');
    if(wallpaper && wallpaper.b64 && messagesEl) applyWallpaperSizing(messagesEl, wallpaper);
  }, 200);
  window.addEventListener('resize', recalcWallpaperSizing);
