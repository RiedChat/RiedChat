// ===================== features/message-search.js =====================
// Поиск по сообщениям текущего чата: лупа в шапке открывает модалку, список обновляется при вводе,
// клик по совпадению закрывает модалку, прокручивает к сообщению и подсвечивает его.
//
// Фильтры (Текст/Фото/Стикеры/Видео/Кружки/Аудио/Файлы): "Текст" - полнотекстовый поиск по обычным сообщениям;
// остальные - галерея вложений типа по всему чату (свежие сверху) с расшифрованным превью (фото/видео)
// или подписью (аудио/файл), как в ui/chat-view/message-body-html.js:classifySingleMedia и ui/roster.js:mediaLabelFor.
//
// Подмодули message-search/: classify.js (тип тела), format.js (время, сниппеты, подписи),
// thumb-loader.js (ленивая расшифровка превью через IntersectionObserver), results-render.js (рендер результатов).
import { $, toast, highlightRow, wireModalDismiss, debounce } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { t } from '../i18n/t.js';
import { ensureMessageRow } from '../ui/chat-view/render-messages.js';

import { renderResults } from './message-search/results-render.js';

let activeFilter = 'all'; // 'all' | 'image' | 'sticker' | 'video' | 'videonote' | 'audio' | 'file'

function renderCurrentResults(query){
  renderResults(query, activeFilter);
}

function scrollToMessage(idx){
  const row = ensureMessageRow(idx);
  if(!row){
    toast(t('search.notFoundInView'));
    return;
  }
  highlightRow(row);
}

function setActiveFilter(filter){
  activeFilter = filter;
  const wrap = $('search-filters');
  if(wrap) wrap.querySelectorAll('.search-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  const input = $('search-modal-input');
  if(input) input.placeholder = filter === 'all' ? t('search.placeholderText') : (filter === 'file' ? t('search.placeholderFile') : t('search.placeholderOptional'));
}

function openSearchModal(){
  if(!state.activeChat){ toast(t('search.openChatFirst')); return; }
  const input = $('search-modal-input');
  input.value = '';
  setActiveFilter('all');
  renderCurrentResults('');
  $('search-modal').showModal();
  input.focus();
}

export function wireMessageSearch(){
  const btn = $('chat-search-btn');
  if(!btn) return;

  const closeSearchModal = wireModalDismiss('search-modal', 'search-modal-close');
  btn.addEventListener('click', openSearchModal);

  // Дебаунс 150мс: без него каждое нажатие делало полный O(n) проход по state.messages[activeChat] и перестройку списка.
  const renderDebounced = debounce(renderCurrentResults, 150);
  $('search-modal-input').addEventListener('input', (e) => renderDebounced(e.target.value));

  $('search-filters').addEventListener('click', (e) => {
    const fbtn = e.target.closest('.search-filter-btn');
    if(!fbtn) return;
    setActiveFilter(fbtn.dataset.filter);
    // Смена фильтра - применяем сразу и отменяем отложенный пересчёт, чтобы он не перетёр результат.
    renderDebounced.cancel();
    renderCurrentResults($('search-modal-input').value);
  });

  $('search-results').addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if(!item) return;
    const idx = item.dataset.idx;
    closeSearchModal();
    scrollToMessage(idx);
  });
}
