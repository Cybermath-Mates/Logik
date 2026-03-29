/* ================================================================
   LOGIK – Game Logic (Czech Mastermind)
   Features:
   - 8 colors, 4-slot code, 10 attempts
   - Click palette → click slot to fill
   - Click filled slot to clear it
   - Black pegs = right color + right position
   - White pegs = right color, wrong position
   - Win/loss detection with animated modals
   - Session stats (wins/losses)
   ================================================================ */

'use strict';

const COLORS = [
  { id: 'red',    label: 'Červená',   hex: '#f24b4b' },
  { id: 'orange', label: 'Oranžová',  hex: '#f5922f' },
  { id: 'yellow', label: 'Žlutá',     hex: '#f5c842' },
  { id: 'green',  label: 'Zelená',    hex: '#3be876' },
  { id: 'teal',   label: 'Tyrkysová', hex: '#22d3c5' },
  { id: 'blue',   label: 'Modrá',     hex: '#4d9fff' },
  { id: 'purple', label: 'Fialová',   hex: '#b96bff' },
  { id: 'pink',   label: 'Růžová',    hex: '#ff6bb3' },
];

const CODE_LENGTH   = 5;
const MAX_ATTEMPTS  = 10;

// ── State ──────────────────────────────────────────────────────
let state = {
  secret:         [],   // e.g. ['red','blue','red','green']
  attempts:       [],   // array of { guess:[], feedback:{blacks, whites} }
  currentGuess:   [null, null, null, null, null],
  selectedColor:  null,
  gameOver:       false,
  stats: {
    wins:   parseInt(localStorage.getItem('logik-wins')   || '0'),
    losses: parseInt(localStorage.getItem('logik-losses') || '0'),
  },
};

// ── DOM refs ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const board           = $('board');
const currentAttemptEl= $('current-attempt');
const secretDisplay   = $('secret-display');
const colorPalette    = $('color-palette');
const selectedDot     = $('selected-color-dot');
const currentPreview  = $('current-row-preview');
const btnSubmit       = $('btn-submit');
const btnClear        = $('btn-clear');
const btnNewGame      = $('btn-new-game');
const btnRules        = $('btn-rules');
const btnCloseRules   = $('btn-close-rules');
const btnStartRules   = $('btn-start-from-rules');
const btnPlayAgain    = $('btn-play-again');
const modalRules      = $('modal-rules');
const modalEnd        = $('modal-end');
const statWins        = $('stat-wins');
const statLosses      = $('stat-losses');

// ── Mobile detection ─────────────────────────────────────────
const isMobile = () => window.innerWidth <= 540;

// ── Init ──────────────────────────────────────────────────────
function init() {
  buildPalette();
  buildMobilePalette();
  attachHeaderListeners();
  updateStatsDisplay();
  window.addEventListener('resize', buildMobilePalette);

  // Show rules on very first visit
  if (!localStorage.getItem('logik-visited')) {
    localStorage.setItem('logik-visited', '1');
    showRulesModal();
  } else {
    startNewGame();
  }
}

// ── Mobile palette (injected into bottom bar) ─────────────────
function buildMobilePalette() {
  // Remove any existing mobile palette
  const existing = document.getElementById('mobile-palette');
  if (existing) existing.remove();

  if (!isMobile()) return; // desktop: not needed

  const guessArea = document.querySelector('.current-guess-area');
  if (!guessArea) return;

  const wrap = document.createElement('div');
  wrap.id = 'mobile-palette';
  wrap.className = 'mobile-palette';

  COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'palette-color';
    dot.dataset.colorMobile = c.id;
    dot.style.backgroundColor = c.hex;
    dot.title = c.label;
    dot.addEventListener('click', () => {
      selectColor(c.id);
      // Also highlight in main palette for consistency
    });
    wrap.appendChild(dot);
  });

  // Insert at top of the guess area (before panel title / slots)
  guessArea.insertBefore(wrap, guessArea.firstChild);
}

// ── New game ──────────────────────────────────────────────────
function startNewGame() {
  state.secret       = generateSecret();
  state.attempts     = [];
  state.currentGuess = Array(CODE_LENGTH).fill(null);
  state.selectedColor= null;
  state.gameOver     = false;

  renderBoard();
  resetPreviewSlots();
  updateSecretDisplay(false);
  updateAttemptCounter();
  deselectAllPalette();
  selectedDot.style.backgroundColor = '';
  selectedDot.style.borderStyle = 'dashed';
  btnSubmit.disabled = true;
  btnClear.disabled  = true;
  hideModal(modalEnd);
}

// ── Secret generation ─────────────────────────────────────────
function generateSecret() {
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, CODE_LENGTH).map(c => c.id);
}

// ── Palette ───────────────────────────────────────────────────
function buildPalette() {
  colorPalette.innerHTML = '';
  COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'palette-color';
    dot.dataset.color = c.id;
    dot.style.backgroundColor = c.hex;
    dot.title = c.label;
    dot.setAttribute('aria-label', c.label);
    dot.addEventListener('click', () => selectColor(c.id));
    colorPalette.appendChild(dot);
  });
}

function selectColor(colorId) {
  state.selectedColor = colorId;
  deselectAllPalette();
  // Highlight in main palette
  const dot = colorPalette.querySelector(`[data-color="${colorId}"]`);
  if (dot) dot.classList.add('selected');
  // Highlight in mobile palette
  const mobileDot = document.querySelector(`#mobile-palette [data-color-mobile="${colorId}"]`);
  if (mobileDot) {
    document.querySelectorAll('#mobile-palette .palette-color').forEach(d => d.classList.remove('selected'));
    mobileDot.classList.add('selected');
  }
  // Update selected dot preview (desktop)
  const c = COLORS.find(c => c.id === colorId);
  selectedDot.style.backgroundColor = c.hex;
  selectedDot.style.borderStyle = 'solid';
  selectedDot.style.borderColor = 'rgba(255,255,255,0.3)';
}

function deselectAllPalette() {
  colorPalette.querySelectorAll('.palette-color').forEach(d => d.classList.remove('selected'));
  document.querySelectorAll('#mobile-palette .palette-color').forEach(d => d.classList.remove('selected'));
}

// ── Board rendering ───────────────────────────────────────────
function renderBoard() {
  board.innerHTML = '';

  // Past attempts (already submitted, bottom to top or just rows)
  state.attempts.forEach((attempt, i) => {
    const row = buildPastRow(attempt, i + 1);
    board.appendChild(row);
  });

  // Active row (if game not over)
  if (!state.gameOver && state.attempts.length < MAX_ATTEMPTS) {
    const activeRow = buildActiveRow(state.attempts.length + 1);
    board.appendChild(activeRow);
  }

  // Empty placeholder rows
  const renderedRows = state.attempts.length + (state.gameOver ? 0 : 1);
  for (let i = renderedRows + 1; i <= MAX_ATTEMPTS; i++) {
    board.appendChild(buildEmptyRow(i));
  }
}

function buildPastRow(attempt, rowNum) {
  const row = document.createElement('div');
  row.className = 'board-row past-row row-reveal';

  // Row number
  const numEl = document.createElement('div');
  numEl.className = 'row-number';
  numEl.textContent = rowNum;

  // Pegs
  const pegsEl = document.createElement('div');
  pegsEl.className = 'row-pegs';
  attempt.guess.forEach(colorId => {
    const peg = createPeg(colorId);
    pegsEl.appendChild(peg);
  });

  // Key pegs
  const keyEl = buildKeyPegs(attempt.feedback);

  row.appendChild(numEl);
  row.appendChild(pegsEl);
  row.appendChild(keyEl);
  return row;
}

function buildActiveRow(rowNum) {
  const row = document.createElement('div');
  row.className = 'board-row active-row';

  const numEl = document.createElement('div');
  numEl.className = 'row-number';
  numEl.textContent = rowNum;

  const pegsEl = document.createElement('div');
  pegsEl.className = 'row-pegs';

  // clickable pegs tied to currentGuess
  state.currentGuess.forEach((colorId, slotIdx) => {
    const peg = createInteractivePeg(colorId, slotIdx);
    pegsEl.appendChild(peg);
  });

  // Empty key peg placeholder
  const keyEl = document.createElement('div');
  keyEl.className = 'key-pegs';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const kp = document.createElement('div');
    kp.className = 'key-peg kp-empty';
    keyEl.appendChild(kp);
  }

  row.appendChild(numEl);
  row.appendChild(pegsEl);
  row.appendChild(keyEl);
  return row;
}

function buildEmptyRow(rowNum) {
  const row = document.createElement('div');
  row.className = 'board-row';

  const numEl = document.createElement('div');
  numEl.className = 'row-number';
  numEl.textContent = rowNum;

  const pegsEl = document.createElement('div');
  pegsEl.className = 'row-pegs';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const peg = document.createElement('div');
    peg.className = 'peg empty-peg';
    pegsEl.appendChild(peg);
  }

  const keyEl = document.createElement('div');
  keyEl.className = 'key-pegs';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const kp = document.createElement('div');
    kp.className = 'key-peg kp-empty';
    keyEl.appendChild(kp);
  }

  row.appendChild(numEl);
  row.appendChild(pegsEl);
  row.appendChild(keyEl);
  return row;
}

// ── Peg helpers ───────────────────────────────────────────────
function createPeg(colorId) {
  const peg = document.createElement('div');
  const c = COLORS.find(c => c.id === colorId);
  peg.className = 'peg filled-peg';
  peg.style.backgroundColor = c.hex;
  peg.dataset.color = colorId;
  return peg;
}

function createInteractivePeg(colorId, slotIdx) {
  const peg = document.createElement('div');
  if (colorId) {
    const c = COLORS.find(c => c.id === colorId);
    peg.className = 'peg filled-peg';
    peg.style.backgroundColor = c.hex;
    peg.dataset.color = colorId;
  } else {
    peg.className = 'peg empty-peg';
  }
  peg.addEventListener('click', () => handlePegClick(slotIdx));
  return peg;
}

function handlePegClick(slotIdx) {
  if (state.gameOver) return;
  if (state.selectedColor) {
    // Place selected color
    setGuessSlot(slotIdx, state.selectedColor);
  } else if (state.currentGuess[slotIdx]) {
    // Clear if no color selected and slot is filled
    setGuessSlot(slotIdx, null);
  }
}

function setGuessSlot(slotIdx, colorId) {
  state.currentGuess[slotIdx] = colorId;
  syncPreviewToBoard();
  updateButtons();
}

// ── Side panel preview slots ──────────────────────────────────
function resetPreviewSlots() {
  const slots = currentPreview.querySelectorAll('.slot');
  slots.forEach((slot, i) => {
    slot.style.backgroundColor = '';
    slot.style.borderStyle = 'dashed';
    slot.style.borderColor = '';
    slot.classList.remove('filled');
    slot.dataset.color = '';
    slot.onclick = () => handlePreviewSlotClick(i);
  });
}

function syncPreviewToBoard() {
  const slots = currentPreview.querySelectorAll('.slot');
  state.currentGuess.forEach((colorId, i) => {
    const slot = slots[i];
    if (colorId) {
      const c = COLORS.find(c => c.id === colorId);
      slot.style.backgroundColor = c.hex;
      slot.style.borderStyle = 'solid';
      slot.style.borderColor = 'rgba(255,255,255,0.25)';
      slot.classList.add('filled');
      slot.dataset.color = colorId;
    } else {
      slot.style.backgroundColor = '';
      slot.style.borderStyle = 'dashed';
      slot.style.borderColor = '';
      slot.classList.remove('filled');
      slot.dataset.color = '';
    }
  });
  // Sync board active row too
  renderActiveRowPegs();
}

function handlePreviewSlotClick(slotIdx) {
  if (state.gameOver) return;
  if (state.selectedColor) {
    setGuessSlot(slotIdx, state.selectedColor);
  } else if (state.currentGuess[slotIdx]) {
    setGuessSlot(slotIdx, null);
  }
}

function renderActiveRowPegs() {
  const activeRow = board.querySelector('.active-row');
  if (!activeRow) return;
  const pegsEl = activeRow.querySelector('.row-pegs');
  pegsEl.innerHTML = '';
  state.currentGuess.forEach((colorId, slotIdx) => {
    const peg = createInteractivePeg(colorId, slotIdx);
    pegsEl.appendChild(peg);
  });
}

// ── Buttons ───────────────────────────────────────────────────
function updateButtons() {
  const filled = state.currentGuess.filter(Boolean).length;
  btnSubmit.disabled = (filled < CODE_LENGTH) || state.gameOver;
  btnClear.disabled  = (filled === 0) || state.gameOver;
}

function attachHeaderListeners() {
  btnNewGame.addEventListener('click', startNewGame);
  btnRules.addEventListener('click', showRulesModal);
  btnCloseRules.addEventListener('click', () => hideModal(modalRules));
  btnStartRules.addEventListener('click', () => { hideModal(modalRules); startNewGame(); });
  btnPlayAgain.addEventListener('click', startNewGame);
  btnSubmit.addEventListener('click', submitGuess);
  btnClear.addEventListener('click', clearGuess);

  // Slots listeners
  currentPreview.querySelectorAll('.slot').forEach((slot, i) => {
    slot.addEventListener('click', () => handlePreviewSlotClick(i));
  });

  // Close modal on overlay click
  modalRules.addEventListener('click', e => { if (e.target === modalRules) hideModal(modalRules); });
  modalEnd.addEventListener('click', e => { if (e.target === modalEnd) startNewGame(); });
}

function clearGuess() {
  state.currentGuess = Array(CODE_LENGTH).fill(null);
  syncPreviewToBoard();
  updateButtons();
}

// ── Submit guess ──────────────────────────────────────────────
function submitGuess() {
  if (state.gameOver) return;
  if (state.currentGuess.some(c => !c)) {
    // Shake the preview
    currentPreview.classList.add('shake');
    setTimeout(() => currentPreview.classList.remove('shake'), 400);
    return;
  }

  const feedback = evaluate(state.currentGuess, state.secret);
  state.attempts.push({ guess: [...state.currentGuess], feedback });
  state.currentGuess = Array(CODE_LENGTH).fill(null);

  renderBoard();
  resetPreviewSlots();
  updateAttemptCounter();
  updateButtons();

  // Animate the key pegs of the just-submitted row
  animateLastRowKeyPegs();

  // Auto-scroll to active row (important on mobile)
  scrollToActiveRow();

  if (feedback.blacks === CODE_LENGTH) {
    // Win
    setTimeout(() => endGame(true), 450);
  } else if (state.attempts.length >= MAX_ATTEMPTS) {
    // Loss
    setTimeout(() => endGame(false), 450);
  }
}

// ── Feedback evaluation ───────────────────────────────────────
function evaluate(guess, secret) {
  let blacks = 0;
  let whites  = 0;

  const secretCopy = [...secret];
  const guessCopy  = [...guess];

  // First pass: exact matches (black)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] === secretCopy[i]) {
      blacks++;
      secretCopy[i] = null;
      guessCopy[i]  = null;
    }
  }

  // Second pass: color matches in wrong positions (white)
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guessCopy[i] === null) continue;
    const idx = secretCopy.indexOf(guessCopy[i]);
    if (idx !== -1) {
      whites++;
      secretCopy[idx] = null;
    }
  }

  return { blacks, whites };
}

// ── Key pegs builder ──────────────────────────────────────────
function buildKeyPegs(feedback) {
  const keyEl = document.createElement('div');
  keyEl.className = 'key-pegs';

  const pegs = [
    ...Array(feedback.blacks).fill('black'),
    ...Array(feedback.whites).fill('white'),
    ...Array(CODE_LENGTH - feedback.blacks - feedback.whites).fill('empty'),
  ];

  pegs.forEach(type => {
    const kp = document.createElement('div');
    kp.className = `key-peg kp-${type}`;
    keyEl.appendChild(kp);
  });

  return keyEl;
}

function animateLastRowKeyPegs() {
  const rows = board.querySelectorAll('.past-row');
  const lastRow = rows[rows.length - 1];
  if (!lastRow) return;
  const keyPegs = lastRow.querySelectorAll('.key-peg');
  keyPegs.forEach((kp, i) => {
    setTimeout(() => kp.classList.add('key-pop'), i * 60);
  });
}

function scrollToActiveRow() {
  const activeRow = board.querySelector('.active-row') || board.lastElementChild;
  if (!activeRow) return;
  // Small delay to let DOM settle after renderBoard()
  setTimeout(() => {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// ── Secret display ─────────────────────────────────────────────
function updateSecretDisplay(reveal) {
  secretDisplay.innerHTML = '';
  if (reveal) {
    state.secret.forEach(colorId => {
      const peg = createPeg(colorId);
      peg.classList.add('peg-pop');
      secretDisplay.appendChild(peg);
    });
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      const ph = document.createElement('div');
      ph.className = 'peg-hidden';
      secretDisplay.appendChild(ph);
    }
  }
}

// ── Attempt counter ────────────────────────────────────────────
function updateAttemptCounter() {
  currentAttemptEl.textContent = Math.min(state.attempts.length + 1, MAX_ATTEMPTS);
}

// ── End game ───────────────────────────────────────────────────
function endGame(won) {
  state.gameOver = true;
  updateSecretDisplay(true);
  renderBoard(); // re-render without active row

  if (won) {
    state.stats.wins++;
    localStorage.setItem('logik-wins', state.stats.wins);
  } else {
    state.stats.losses++;
    localStorage.setItem('logik-losses', state.stats.losses);
  }
  updateStatsDisplay();

  // Build end modal
  $('end-emoji').textContent   = won ? '🎉' : '💀';
  $('end-title').textContent   = won ? 'Prolomil jsi kód!' : 'Kód zůstal utajen...';
  $('end-subtitle').textContent = won
    ? `Gratulace! Zvládl jsi to za ${state.attempts.length} ${pokusText(state.attempts.length)}.`
    : `Tajný kód byl: nevzdávej to, hraj znovu!`;

  const revealedCode = $('revealed-code');
  revealedCode.innerHTML = '';
  state.secret.forEach((colorId, i) => {
    const peg = createPeg(colorId);
    peg.classList.add('peg-pop');
    peg.style.animationDelay = `${i * 80}ms`;
    revealedCode.appendChild(peg);
  });

  setTimeout(() => showModal(modalEnd), 300);
}

function pokusText(n) {
  if (n === 1) return 'pokus';
  if (n >= 2 && n <= 4) return 'pokusy';
  return 'pokusů';
}

// ── Stats ──────────────────────────────────────────────────────
function updateStatsDisplay() {
  statWins.textContent   = state.stats.wins;
  statLosses.textContent = state.stats.losses;
}

// ── Modal helpers ──────────────────────────────────────────────
function showModal(modal) { modal.classList.remove('hidden'); }
function hideModal(modal) { modal.classList.add('hidden'); }
function showRulesModal()  { showModal(modalRules); }

// ── Kick off ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
