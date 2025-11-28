// -------------------------
// ELEMENTOS
// -------------------------
const el = {
  inputOrigem: document.getElementById('inputOrigem'),
  inputDestino: document.getElementById('inputDestino'),
  selectOrigem: document.getElementById('selectOrigem'),
  selectDestino: document.getElementById('selectDestino'),
  btnTrade: document.getElementById('btn-trade'),
  btnIcon: document.getElementById('btn-icon'),

  // MODAL
  modal: document.getElementById('modal-moedas'),
  modalSearch: document.getElementById('busca'),
  modalContent: document.querySelector('#modal-moedas .modal-content'),
  modalItems: [],
};

// -------------------------
// STATE
// -------------------------
const state = {
  origem: { codigo: 'BRL', flagClass: 'fi-br' },
  destino: { codigo: 'USD', flagClass: 'fi-us' },
  taxa: 0,
  lastPair: '',
  isAnimating: false,
  rotation: 0,
  modalEditando: null,
};

// -------------------------
// UTILS
// -------------------------
function round(num, dec = 2) {
  const factor = 10 ** dec;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

function formatForInput(num) {
  return num.toFixed(2);
}

function showError(msg) {
  console.warn(msg);
  el.inputDestino.value = '—';
}

// -------------------------
// API: busca taxa com Frankfurter
// -------------------------
async function fetchTaxa(origem, destino) {
  const pair = `${origem}-${destino}`;
  if (pair === state.lastPair && typeof state.taxa === 'number' && state.taxa > 0) {
    return state.taxa;
  }

  const url = `https://api.frankfurter.app/latest?amount=1&from=${origem}&to=${destino}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.[destino];
    if (typeof rate !== 'number') throw new Error('Rate inválida');

    state.taxa = rate;
    state.lastPair = pair;
    return rate;
  } catch (err) {
    showError('Falha ao buscar taxa — verifique sua conexão');
    console.error(err);
    return state.taxa || 0;
  }
}

// -------------------------
// UI: sincronização dos selects
// -------------------------
function syncSelectorsFromState() {
  el.selectOrigem.querySelector('p').textContent = state.origem.codigo;
  el.selectOrigem.querySelector('span.fi').className = `fi ${state.origem.flagClass}`;

  el.selectDestino.querySelector('p').textContent = state.destino.codigo;
  el.selectDestino.querySelector('span.fi').className = `fi ${state.destino.flagClass}`;

  el.selectOrigem.dataset.currency = state.origem.codigo;
  el.selectDestino.dataset.currency = state.destino.codigo;
}

// -------------------------
// Atualiza input destino
// -------------------------
function atualizarDestino() {
  const raw = el.inputOrigem.value;
  if (!raw || raw.trim() === '') {
    el.inputDestino.value = '';
    return;
  }
  const valor = Number(raw);
  if (!isFinite(valor)) {
    el.inputDestino.value = '';
    return;
  }
  const convertido = valor * (state.taxa || 0);
  el.inputDestino.value = isFinite(convertido) ? formatForInput(convertido) : '';
}

// -------------------------
// Troca origem/destino
// -------------------------
let tradeLock = false;
async function trocarMoedas() {
  if (tradeLock) return;
  tradeLock = true;

  animarTrade();

  [state.origem, state.destino] = [state.destino, state.origem];
  syncSelectorsFromState();

  await fetchTaxa(state.origem.codigo, state.destino.codigo);
  atualizarDestino();

  setTimeout(() => (tradeLock = false), 1000);
}

// -------------------------
// Animação botão trade
// -------------------------
function animarTrade() {
  if (state.isAnimating) return;
  state.isAnimating = true;

  state.rotation += 180;

  const baseRotation = window.innerWidth <= 750 ? 90 : 0;

  el.btnIcon.style.transform = `rotate(${state.rotation + baseRotation}deg)`;

  setTimeout(() => (state.isAnimating = false), 1000);
}

// MEDIA QUERIES BOTÃO TRADE
window.addEventListener('resize', () => {
  const baseRotation = window.innerWidth <= 750 ? 90 : 0;
  el.btnIcon.style.transform = `rotate(${state.rotation + baseRotation}deg)`;
});

// -------------------------
// Input origem
// -------------------------
let inputDebounce = null;
el.inputOrigem.addEventListener('input', () => {
  if (inputDebounce) clearTimeout(inputDebounce);
  inputDebounce = setTimeout(atualizarDestino, 120);
});

// -------------------------
// Botão trade
// -------------------------
el.btnTrade.addEventListener('click', async e => {
  e.preventDefault();
  await trocarMoedas();
});

// -------------------------
// Modal dinâmico
// -------------------------
const MARGIN = 8;
let lastIconCaret = null;
let lastPertoDe = null;
let modalResizeTimeout = null;
const moedas = [];

// 
// API: Pegar moedas suportadas
// 
async function fetchMoedas() {
  try {
    const res = await fetch('https://api.frankfurter.app/currencies');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Object.keys(data).map(code => ({
      codigo: code,
      nome: data[code],
      flag: code.slice(0, 2).toLowerCase(),
    }));
  } catch (err) {
    console.error('Erro ao buscar moedas:', err);
    return [];
  }
}

async function initMoedas() {
  const moedasAPI = await fetchMoedas();
  if (moedasAPI.length) {
    moedas.length = 0;
    moedas.push(...moedasAPI);
    criarItensModal();
  }
}

// Cria dinamicamente itens do modal
function criarItensModal() {
  el.modalContent.innerHTML = '';
  moedas.forEach(m => {
    const divItem = document.createElement('div');
    divItem.className = 'moeda-item';
    divItem.dataset.currency = m.codigo;
    divItem.dataset.flag = m.flag;

    divItem.innerHTML = `
      <div class="moeda-info">
        <span class="fi fi-${m.flag}"></span>
        <p>${m.codigo}</p>
      </div>
      <i class="ph ph-check check-icon"></i>
    `;

    divItem.addEventListener('click', () => selecionarMoeda(divItem));
    el.modalContent.appendChild(divItem);
  });

  el.modalItems = document.querySelectorAll('.moeda-item');
}

// -------------------------
// Abrir modal
// -------------------------
function abrirModal(tipo, pertoDe) {
  fecharModal();

  state.modalEditando = tipo;
  lastPertoDe = pertoDe;
  el.modalSearch.value = '';
  filtrarMoedas('');

  // Remove moeda block
  el.modalItems.forEach(i => i.classList.remove('moeda-block'))

  const codigoBloqueado = tipo === 'origem' ? state.destino.codigo : state.origem.codigo;

  el.modalItems.forEach(item => {
  if (item.dataset.currency === codigoBloqueado) {
    item.classList.add('moeda-block');
    item.style.cursor = 'not-allowed';
  } else {
    item.style.cursor = 'pointer';
  }
  });

  // Remove check
  el.modalItems.forEach(mi => mi.classList.remove('selecionada'));

  // Marca moeda atual
  const codigoAtual = tipo === 'origem' ? state.origem.codigo : state.destino.codigo;
  const itemAtual = Array.from(el.modalItems).find(mi => mi.dataset.currency === codigoAtual);
  if (itemAtual) itemAtual.classList.add('selecionada');

  // Muda icone ao abrir modal
  lastIconCaret = lastPertoDe.querySelector('span > i');
  if (lastIconCaret) lastIconCaret.classList.replace('ph-caret-down', 'ph-caret-up');

  el.modal.classList.add('show');
  el.modal.style.display = 'block';
  el.modal.style.visibility = 'hidden';

  posicionarModal(pertoDe);
  el.modal.style.visibility = 'visible';

  window.addEventListener('resize', onWindowChangeDebounced);
  window.addEventListener('scroll', onWindowChangeDebounced, { passive: true });
  document.addEventListener('pointerdown', onDocumentPointerDown);
}

// -------------------------
// Fechar modal
// -------------------------
function fecharModal() {
  el.modal.classList.remove('show');
  el.modal.style.left = '';
  el.modal.style.top = '';
  el.modal.style.maxHeight = '';
  el.modal.style.visibility = '';
  el.modal.style.display = '';

  if (lastIconCaret) lastIconCaret.classList.replace('ph-caret-up', 'ph-caret-down');

  window.removeEventListener('resize', onWindowChangeDebounced);
  window.removeEventListener('scroll', onWindowChangeDebounced);
  document.removeEventListener('pointerdown', onDocumentPointerDown);

  state.modalEditando = null;
  lastPertoDe = null;
  lastIconCaret = null;
}

// -------------------------
// Reposicionar modal
// -------------------------
function reposicionarModal() {
  if (!el.modal.classList.contains('show') || !lastPertoDe) return;
  posicionarModal(lastPertoDe);
}

function onWindowChangeDebounced() {
  if (modalResizeTimeout) clearTimeout(modalResizeTimeout);
  modalResizeTimeout = setTimeout(reposicionarModal, 50);
}

function posicionarModal(pertoDe) {
  const rect = pertoDe.getBoundingClientRect();
  const modalWidth = el.modal.offsetWidth;
  const modalHeight = el.modal.offsetHeight;

  let left = rect.right + MARGIN;
  if (left + modalWidth > window.innerWidth - MARGIN) {
    left = rect.left - modalWidth - MARGIN;
  }
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - modalWidth - MARGIN));

  let top = rect.bottom + MARGIN;
  if (top + modalHeight > window.innerHeight - MARGIN) {
    top = rect.top - modalHeight - MARGIN;
  }

  if (top < MARGIN) {
    const spaceAbove = rect.top - MARGIN;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    if (spaceBelow >= spaceAbove) {
      el.modal.style.maxHeight = `${Math.max(80, spaceBelow)}px`;
      top = rect.bottom + MARGIN;
    } else {
      el.modal.style.maxHeight = `${Math.max(80, spaceAbove)}px`;
      top = Math.max(MARGIN, rect.top - Math.min(spaceAbove, modalHeight) - MARGIN);
    }
  } else {
    el.modal.style.maxHeight = '';
  }

  el.modal.style.left = `${left + window.scrollX}px`;
  el.modal.style.top = `${top + window.scrollY}px`;
}

// -------------------------
// Clique fora modal
// -------------------------
function onDocumentPointerDown(e) {
  if (!el.modal.classList.contains('show')) return;
  if (el.modal.contains(e.target)) return;
  if (el.selectOrigem.contains(e.target) || el.selectDestino.contains(e.target)) return;

  fecharModal();
}

// -------------------------
// Filtrar moedas
// -------------------------
function filtrarMoedas(texto) {
  const termo = texto.toLowerCase();
  el.modalItems.forEach(item => {
    const codigo = item.dataset.currency.toLowerCase();
    const flag = item.dataset.flag.toLowerCase();
    item.style.display = (codigo.includes(termo) || flag.includes(termo)) ? 'flex' : 'none';
  });
}

el.modalSearch.addEventListener('input', e => filtrarMoedas(e.target.value));

// -------------------------
// Selecionar moeda
// -------------------------
function selecionarMoeda(item) {
  if (item.classList.contains('moeda-block')) return;

  el.modalItems.forEach(mi => mi.classList.remove('selecionada'));
  item.classList.add('selecionada');

  const codigo = item.dataset.currency;
  const flag = `fi-${item.dataset.flag}`;

  if (state.modalEditando === 'origem') {
    state.origem.codigo = codigo;
    state.origem.flagClass = flag;
  } else if (state.modalEditando === 'destino') {
    state.destino.codigo = codigo;
    state.destino.flagClass = flag;
  }

  syncSelectorsFromState();
  fecharModal();
  fetchTaxa(state.origem.codigo, state.destino.codigo).then(atualizarDestino);
}

// -------------------------
// Listeners selects
// -------------------------
el.selectOrigem.addEventListener('click', e => abrirModal('origem', e.currentTarget));
el.selectDestino.addEventListener('click', e => abrirModal('destino', e.currentTarget));

// -------------------------
// Inicialização
// -------------------------
(async function init() {
    await initMoedas();

    const pOrig = el.selectOrigem.querySelector('p');
    const pDest = el.selectDestino.querySelector('p');
    const fOrig = el.selectOrigem.querySelector('span.fi');
    const fDest = el.selectDestino.querySelector('span.fi');

    if (pOrig) state.origem.codigo = pOrig.textContent.trim();
    if (pDest) state.destino.codigo = pDest.textContent.trim();
    if (fOrig) state.origem.flagClass = Array.from(fOrig.classList).find(c => c.startsWith('fi-')) || state.origem.flagClass;
    if (fDest) state.destino.flagClass = Array.from(fDest.classList).find(c => c.startsWith('fi-')) || state.destino.flagClass;

    syncSelectorsFromState();

    if (el.inputOrigem) el.inputOrigem.value = el.inputOrigem.value || '1';

    await fetchTaxa(state.origem.codigo, state.destino.codigo);
    atualizarDestino();
})();