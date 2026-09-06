// ===================== features/message-search.js =====================
// Поиск по сообщениям текущего чата: лупа в шапке чата (рядом с ником)
// открывает модалку, список совпадений обновляется по мере ввода, клик по
// совпадению закрывает модалку и прокручивает список сообщений к нужному,
// подсвечивая его на пару секунд.
//
// Кнопки-фильтры (Текст/Фото/Стикеры/Видео/Кружки/Аудио/Файлы) переключают режим списка:
// "Текст" - обычный полнотекстовый поиск по обычным сообщениям (как раньше);
// остальные - галерея вложений нужного типа по всему чату (без пустого
// текстового запроса, свежие сверху), где вместо голой aesgcm-/https-ссылки
// показывается настоящее расшифрованное превью (фото/видео) либо понятная
// подпись (аудио/файл) - как в остальном интерфейсе (см.
// ui/chat-view/message-body-html.js:classifySingleMedia и
// ui/roster.js:mediaLabelFor, откуда взят тот же принцип классификации).
//
// Логика разбита на подмодули в features/message-search/:
//   classify.js       - определение типа тела сообщения (текст/вложение)
//   format.js         - форматирование времени, сниппетов, подписей
//   thumb-loader.js   - ленивая расшифровка превью через IntersectionObserver
//   results-render.js - рендер списка результатов (текст и медиа-галерея)
import { $, toast, wireModalDismiss } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { renderResults } from './message-search/results-render.js';
import { t } from '../i18n/t.js';

const S = state;

let activeFilter = 'all'; // 'all' | 'image' | 'sticker' | 'video' | 'videonote' | 'audio' | 'file'

function renderCurrentResults(query){
  renderResults(query, activeFilter);
}

function scrollToMessage(idx){
  const row = document.querySelector('#messages .msg-row[data-idx="' + idx + '"]');
  if(!row){
    toast(t('search.notFoundInView'));
    return;
  }
  row.scrollIntoView({block:'center', behavior:'smooth'});
  row.classList.add('search-highlight');
  setTimeout(() => row.classList.remove('search-highlight'), 1600);
}

function setActiveFilter(filter){
  activeFilter = filter;
  const wrap = $('search-filters');
  if(wrap) wrap.querySelectorAll('.search-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  const input = $('search-modal-input');
  if(input) input.placeholder = filter === 'all' ? t('search.placeholderText') : (filter === 'file' ? t('search.placeholderFile') : t('search.placeholderOptional'));
}

function openSearchModal(){
  if(!S.activeChat){ toast(t('search.openChatFirst')); return; }
  const input = $('search-modal-input');
  input.value = '';
  setActiveFilter('all');
  renderCurrentResults('');
  $('search-modal').classList.add('active');
  setTimeout(() => input.focus(), 0); // после display:flex - иначе фокус на мобильных иногда не срабатывает
}

export function wireMessageSearch(){
  const btn = $('chat-search-btn');
  if(!btn) return;

  const closeSearchModal = wireModalDismiss('search-modal', 'search-modal-close');
  btn.addEventListener('click', openSearchModal);
  $('search-modal-input').addEventListener('input', function(){ renderCurrentResults(this.value); });

  $('search-filters').addEventListener('click', (e) => {
    const fbtn = e.target.closest('.search-filter-btn');
    if(!fbtn) return;
    setActiveFilter(fbtn.dataset.filter);
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
