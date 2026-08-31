'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - nut/tuerca
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - nut/tuerca (con hueco central)
];

// Skins: cada uno define su propia paleta (mismos índices 1-8 que
// PIECES/board, con null en 0) y su propia función de dibujado de bloque.
// El resto del juego (board, collide, merge, clearLines...) sigue operando
// sobre el mismo entero 1-8 de siempre, así que el invariante de celda del
// CLAUDE.md no cambia — el skin solo decide qué color y qué trazo usa
// drawBlock() para pintar ese entero. draw()/drawNext() se ejecutan en cada
// frame (loop) o al regenerar la vista previa, así que cambiar de skin se
// refleja de inmediato sin recargar la página.
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function renderBlockRetro(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function renderBlockNeon(context, x, y, size, color) {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = 'rgba(8,8,18,0.85)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
  context.restore();
}

function renderBlockPastel(context, x, y, size, color) {
  const r = size * 0.28;
  roundedRectPath(context, x * size + 2, y * size + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  // highlight superior, redondeado igual que el bloque
  roundedRectPath(context, x * size + 2, y * size + 2, size - 4, (size - 4) * 0.4, r);
  context.fillStyle = 'rgba(255,255,255,0.4)';
  context.fill();
}

function renderBlockPixel(context, x, y, size, color) {
  const px = x * size, py = y * size, s = size - 2;
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, s, s);
  // patrón de pixeles alternos (look 8-bit) sobre el bloque
  const step = Math.max(3, Math.floor(s / 5));
  context.fillStyle = 'rgba(0,0,0,0.16)';
  for (let ry = 0; ry < s; ry += step)
    for (let rx = 0; rx < s; rx += step)
      if (((rx / step + ry / step) | 0) % 2 === 0)
        context.fillRect(px + 1 + rx, py + 1 + ry, step, step);
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 1, py + 1, s, s);
}

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,   // usa el fondo del tema claro/oscuro (CSS var)
    gridLine: null,  // idem, el color de rejilla del tema
    renderBlock: renderBlockRetro,
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00fff2', '#faff00', '#e000ff', '#00ff85', '#ff1744', '#00b0ff', '#ff9100', '#e8eaf6'],
    boardBg: '#05050a',
    gridLine: 'rgba(120,140,255,0.14)',
    renderBlock: renderBlockNeon,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a7e8f0', '#fff2b2', '#dcb8f0', '#b8e6c1', '#f5b8b8', '#b8d4f5', '#f5d0a8', '#d8dee3'],
    boardBg: '#fdfaf5',
    gridLine: '#f0e6e0',
    renderBlock: renderBlockPastel,
  },
  pixel: {
    label: 'Pixel Art',
    colors: [null, '#00d9d9', '#e5e500', '#a000e5', '#00e500', '#e50000', '#2020e5', '#e58000', '#a8a8a8'],
    boardBg: null,
    gridLine: null,
    renderBlock: renderBlockPixel,
  },
};

const LINE_SCORES = [0, 100, 300, 500, 800];

// Power-ups: aparecen en la pieza `next` cada POWERUP_LINE_INTERVAL líneas
// eliminadas (acumuladas). El efecto se resuelve una sola vez, al encajar la
// pieza (ver resolvePowerUp), y solo afecta a `board` — nunca se guarda un
// valor especial en las celdas, así que el invariante "1-8 = tipo/color/
// ocupado" de las celdas del tablero no cambia.
const POWERUPS = {
  bomb:     { emoji: '💣', color: '#ff5252', label: 'Bomba' },     // destruye un área 3×3
  rayo:     { emoji: '⚡', color: '#fff176', label: 'Rayo' },      // limpia toda(s) la(s) fila(s) que toca
  tinte:    { emoji: '🎨', color: '#e040fb', label: 'Tinte' },     // elimina del tablero un color al azar
  gravedad: { emoji: '🌀', color: '#8d6e63', label: 'Gravedad' },  // compacta huecos en cada columna
  congelar: { emoji: '❄️', color: '#4fc3f7', label: 'Congelar' },  // pausa la caída automática 5s
};
const POWERUP_LINE_INTERVAL = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayStats = document.getElementById('overlay-stats');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const backBtn = document.getElementById('back-btn');
const startLevelSelect = document.getElementById('start-level-select');
const recordsListEl = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const saveScoreWrap = document.getElementById('save-score-wrap');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayRecordsList = document.getElementById('overlay-records-list');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor;
let pendingPowerUp, freezeUntil, announceUntil, announceText;
let startLevel, pauseView;
// comboCount/runBestCombo track *consecutive* locks that each clear at
// least one line (reset to 0 on any lock that clears nothing) — this is
// the classic "combo" streak, not the single-clear count in LINE_SCORES.
// recordsData persists across games (localStorage) and is loaded once at
// script start, not reset by init().
let comboCount, runBestCombo, recordsData;
let currentSkin = 'retro';

const THEME_KEY = 'tetris-theme';
const START_LEVEL_KEY = 'tetris-start-level';
const RECORDS_KEY = 'tetris-records-data';
const MAX_RECORDS = 5;
const SKIN_KEY = 'tetris-skin';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

// Cambia de skin y repinta de inmediato: draw() se llama en cada frame del
// loop mientras se juega, y aquí forzamos también un redibujado de board y
// next-preview por si el juego está en pausa/game-over y el loop no está
// corriendo.
function applySkin(skin) {
  currentSkin = SKINS[skin] ? skin : 'retro';
  skinSelect.value = currentSkin;
  if (board) draw();
  if (next) drawNext();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function powerUpPiece() {
  const piece = randomPiece();
  const keys = Object.keys(POWERUPS);
  piece.powerUp = keys[Math.floor(Math.random() * keys.length)];
  return piece;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Elimina las filas indicadas (índices en `board`, en cualquier orden) y
// aplica la puntuación/nivel/hito de power-up correspondientes. La usan
// tanto clearLines (filas completas) como el Rayo (fuerza el borrado de
// filas aunque no estén completas).
function clearRows(rowIndices) {
  const toClear = new Set(rowIndices);
  const cleared = toClear.size;
  if (!cleared) return 0;
  board = board.filter((_, r) => !toClear.has(r));
  while (board.length < ROWS) board.unshift(new Array(COLS).fill(0));

  const prevMilestone = Math.floor(lines / POWERUP_LINE_INTERVAL);
  lines += cleared;
  if (Math.floor(lines / POWERUP_LINE_INTERVAL) > prevMilestone) pendingPowerUp = true;
  score += (LINE_SCORES[cleared] || 0) * level;
  level = startLevel + Math.floor(lines / 10);
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  updateHUD();
  return cleared;
}

function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(v => v !== 0)) full.push(r);
  return clearRows(full);
}

// Aplica el efecto de una pieza especial justo después de encajarla
// (`current` sigue siendo la pieza que acaba de fijarse). Solo muta
// `board`/`freezeUntil`; nunca escribe un valor de celda fuera de 0-8.
function resolvePowerUp(type) {
  const piece = current;
  switch (type) {
    case 'bomb': {
      // Centro de la bomba = centro de las celdas realmente ocupadas (no del
      // bounding box de la matriz), para que quede centrada en la I tumbada.
      let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c]) {
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
          }
      const cy = piece.y + Math.round((minR + maxR) / 2);
      const cx = piece.x + Math.round((minC + maxC) / 2);
      for (let r = cy - 1; r <= cy + 1; r++)
        for (let c = cx - 1; c <= cx + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    }
    case 'rayo': {
      const rows = new Set();
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c]) rows.add(piece.y + r);
      return clearRows([...rows]);
    }
    case 'tinte': {
      const present = new Set();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) present.add(board[r][c]);
      if (present.size) {
        const colors = [...present];
        const target = colors[Math.floor(Math.random() * colors.length)];
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) board[r][c] = 0;
      }
      break;
    }
    case 'gravedad': {
      for (let c = 0; c < COLS; c++) {
        const colVals = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) colVals.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--) board[r][c] = colVals.length ? colVals.pop() : 0;
      }
      break;
    }
    case 'congelar':
      freezeUntil = performance.now() + 5000;
      break;
  }
  return 0;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  // A single lock can clear rows twice (Rayo's forced clear, then the
  // normal full-row check) — combine both into one combo update so the
  // streak only advances once per lock, matching how clearRows already
  // scores/levels each call independently but a "combo" is per-lock.
  let cleared = 0;
  if (current.powerUp) cleared += resolvePowerUp(current.powerUp);
  cleared += clearLines();
  updateCombo(cleared);
  spawn();
}

function updateCombo(cleared) {
  if (cleared > 0) {
    comboCount++;
    if (comboCount > runBestCombo) runBestCombo = comboCount;
  } else {
    comboCount = 0;
  }
}

function spawn() {
  current = next;
  next = pendingPowerUp ? powerUpPiece() : randomPiece();
  pendingPowerUp = false;
  if (current.powerUp) {
    const p = POWERUPS[current.powerUp];
    announceText = `${p.emoji} ¡Pieza especial: ${p.label}!`;
    announceUntil = performance.now() + 2500;
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha, overrideColor) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = overrideColor || skin.colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.renderBlock(context, x, y, size, color);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[currentSkin].gridLine || gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const boardBg = SKINS[currentSkin].boardBg;
  if (boardBg) {
    ctx.fillStyle = boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  const glow = current.powerUp ? POWERUPS[current.powerUp].color : null;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, 1, glow);
  ctx.shadowBlur = 0;

  // indicador de congelación
  if (freezeUntil > 0) {
    const remaining = Math.max(0, (freezeUntil - performance.now()) / 1000);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 4, 168, 26);
    ctx.fillStyle = POWERUPS.congelar.color;
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`❄ Congelado ${remaining.toFixed(1)}s`, 10, 22);
  }

  // aviso grande y temporal cuando aparece una pieza especial (2.5s), para
  // que el power-up sea imposible de pasar por alto además del brillo en
  // la vista previa.
  if (announceUntil > 0) {
    if (performance.now() >= announceUntil) {
      announceUntil = 0;
    } else {
      ctx.font = 'bold 18px sans-serif';
      const textWidth = ctx.measureText(announceText).width;
      const boxW = textWidth + 28, boxH = 36;
      const boxX = (canvas.width - boxW) / 2, boxY = 50;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(announceText, canvas.width / 2, boxY + 24);
      ctx.textAlign = 'left';
    }
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const boardBg = SKINS[currentSkin].boardBg;
  if (boardBg) {
    nextCtx.fillStyle = boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const glow = next.powerUp ? POWERUPS[next.powerUp].color : null;
  if (glow) { nextCtx.shadowColor = glow; nextCtx.shadowBlur = 10; }
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, 1, glow);
  nextCtx.shadowBlur = 0;
  if (next.powerUp) {
    // Fondo opaco + fillStyle explícito: sin esto el emoji hereda el
    // fillStyle translúcido que deja el último drawBlock (el highlight
    // "rgba(255,255,255,0.12)"), y en fuentes sin glifo de color a todo
    // color se ve casi invisible.
    nextCtx.fillStyle = 'rgba(0,0,0,0.55)';
    nextCtx.fillRect(0, 0, 28, 28);
    nextCtx.fillStyle = '#ffffff';
    nextCtx.font = 'bold 20px sans-serif';
    nextCtx.textAlign = 'left';
    nextCtx.fillText(POWERUPS[next.powerUp].emoji, 3, 22);
  }
}

// ---- Tabla de récords (localStorage) ----
// recordsData = { scores: [{name, score}, ...] (top MAX_RECORDS, desc), bestCombo, maxLines }
function loadRecordsData() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return { scores: [], bestCombo: 0, maxLines: 0 };
    const parsed = JSON.parse(raw);
    return {
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      bestCombo: Number(parsed.bestCombo) || 0,
      maxLines: Number(parsed.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecordsData() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(recordsData));
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  return recordsData.scores.length < MAX_RECORDS || s > recordsData.scores[recordsData.scores.length - 1].score;
}

function addRecordScore(name, s) {
  recordsData.scores.push({ name, score: s });
  recordsData.scores.sort((a, b) => b.score - a.score);
  recordsData.scores = recordsData.scores.slice(0, MAX_RECORDS);
  saveRecordsData();
}

// Escapa el nombre introducido por el jugador antes de insertarlo como HTML.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderRecordsList(listEl, highlightScore) {
  listEl.innerHTML = '';
  if (!recordsData.scores.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  recordsData.scores.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'records-entry';
    if (highlightScore != null && entry.score === highlightScore) li.classList.add('is-new');
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="name">${escapeHtml(entry.name)}</span><span class="score">${entry.score.toLocaleString()}</span>`;
    listEl.appendChild(li);
  });
}

function renderRecordsPanel() {
  renderRecordsList(recordsListEl, null);
  bestComboEl.textContent = recordsData.bestCombo;
  maxLinesEl.textContent = recordsData.maxLines;
}

function saveScore() {
  if (saveScoreBtn.disabled) return;
  const name = nameInput.value.trim().slice(0, 12) || 'Jugador';
  addRecordScore(name, score);
  saveScoreBtn.disabled = true;
  nameInput.disabled = true;
  renderRecordsList(overlayRecordsList, score);
  renderRecordsPanel();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const prevBestCombo = recordsData.bestCombo;
  const prevMaxLines = recordsData.maxLines;
  recordsData.bestCombo = Math.max(recordsData.bestCombo, runBestCombo);
  recordsData.maxLines = Math.max(recordsData.maxLines, lines);
  saveRecordsData();
  const comboBadge = runBestCombo > prevBestCombo ? ' 🏆' : '';
  const linesBadge = lines > prevMaxLines ? ' 🏆' : '';
  overlayStats.textContent = `Combo máx: ${runBestCombo}${comboBadge}  ·  Líneas: ${lines}${linesBadge}`;

  const qualifies = qualifiesForTop(score);
  if (qualifies) {
    saveScoreWrap.classList.remove('hidden');
    nameInput.value = '';
    nameInput.disabled = false;
    saveScoreBtn.disabled = false;
    setTimeout(() => nameInput.focus(), 50);
  } else {
    saveScoreWrap.classList.add('hidden');
  }
  renderRecordsList(overlayRecordsList, qualifies ? null : score);
  renderRecordsPanel();
  overlay.classList.remove('hidden');
}

// El menú de pausa tiene dos sub-vistas dentro del mismo overlay: la
// principal (reanudar/reiniciar/nivel) y la de controles. `pauseView`
// recuerda cuál está visible para que P/Esc puedan "volver" en vez de
// cerrar el menú cuando se está mirando los controles.
function showPauseMainView() {
  pauseView = 'main';
  pauseControlsView.classList.add('hidden');
  pauseMainView.classList.remove('hidden');
}

function showPauseControlsView() {
  pauseView = 'controls';
  pauseMainView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMainView();
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  // Congelar solo pausa la caída automática; mover/rotar/soft-drop/hard-drop
  // del jugador siguen funcionando con normalidad durante los 5s.
  if (freezeUntil > 0 && ts < freezeUntil) {
    dropAccum = 0;
  } else {
    freezeUntil = 0;
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return; // lockPiece() pudo terminar el juego en este mismo frame; no programar otro
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  pendingPowerUp = false;
  freezeUntil = 0;
  announceUntil = 0;
  announceText = '';
  comboCount = 0;
  runBestCombo = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  saveScoreWrap.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Si el menú de pausa está mostrando los controles, la primera pulsación
    // vuelve a la vista principal en vez de reanudar directamente.
    if (paused && pauseView === 'controls') showPauseMainView();
    else togglePause();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// El botón de reiniciar dentro del menú de pausa reutiliza init(): al ser el
// único punto de reseteo, ya deja paused=false y oculta ambos overlays.
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
controlsBtn.addEventListener('click', showPauseControlsView);
backBtn.addEventListener('click', showPauseMainView);

// El nivel inicial solo se guarda aquí; init() lo lee al (re)empezar, así
// que cambiarlo durante una pausa no afecta a la partida en curso, solo a
// la siguiente ("empezar la próxima partida" en un nivel concreto).
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10);
  localStorage.setItem(START_LEVEL_KEY, startLevel);
});

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

saveScoreBtn.addEventListener('click', saveScore);
nameInput.addEventListener('keydown', e => {
  // Detiene la propagación al listener global de teclado (que ignora todo
  // mientras gameOver es true, pero así evitamos también el pitido/scroll
  // por defecto de teclas como Space dentro del campo).
  e.stopPropagation();
  if (e.code === 'Enter') { e.preventDefault(); saveScore(); }
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  recordsData = { scores: [], bestCombo: 0, maxLines: 0 };
  saveRecordsData();
  renderRecordsPanel();
  if (!overlay.classList.contains('hidden')) renderRecordsList(overlayRecordsList, null);
});

skinSelect.addEventListener('change', () => {
  localStorage.setItem(SKIN_KEY, skinSelect.value);
  applySkin(skinSelect.value);
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
startLevel = parseInt(localStorage.getItem(START_LEVEL_KEY), 10) || 1;
startLevelSelect.value = startLevel;
recordsData = loadRecordsData();
renderRecordsPanel();
init();
