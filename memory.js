// ============================================================
//  memory.js — 神経衰弱 (Concentration / Memory)
//
//  ルール:
//    全カードを裏向きで並べ、2枚ずつめくる。
//    同じランクのカードが出たらペア成立（取り除く）。
//    全ペアを揃えたらクリア。
// ============================================================

'use strict';

// ============================================================
//  定数
// ============================================================

const ALL_SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const ALL_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const DIFFICULTIES = {
  easy:   { ranks: ALL_RANKS.slice(0, 4),  cols: 4,  label: 'EASY',   jpLabel: 'かんたん'  },
  normal: { ranks: ALL_RANKS.slice(0, 8),  cols: 8,  label: 'NORMAL', jpLabel: 'ふつう'    },
  hard:   { ranks: ALL_RANKS,              cols: 13, label: 'HARD',   jpLabel: 'むずかしい' },
};

const MEM_SAVE_KEY = 'card_games_save_v1';

// ============================================================
//  ゲーム状態
// ============================================================

let G = null;
let timerInterval = null;

// ============================================================
//  初期化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // 難易度カードのクリック
  document.querySelectorAll('.diff-card').forEach(btn => {
    btn.addEventListener('click', () => startGame(btn.dataset.diff));
  });

  // 結果画面ボタン
  document.getElementById('result-play-again-btn')
    .addEventListener('click', () => { if (G?.difficulty) startGame(G.difficulty); });
  document.getElementById('result-change-diff-btn')
    .addEventListener('click', showDifficultyScreen);

  // やめるボタン
  document.getElementById('quit-game-btn')
    .addEventListener('click', showDifficultyScreen);

  // 難易度選択画面のミニプレビューを生成
  buildDiffPreviews();
  renderDifficultyRecords();
  showDifficultyScreen();
  updateCoinDisplay();
});

// ============================================================
//  画面管理
// ============================================================

function showDifficultyScreen() {
  stopTimer();
  G = null;
  renderDifficultyRecords();
  document.getElementById('difficulty-screen').classList.remove('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('header-stats').classList.add('hidden');
  document.getElementById('quit-game-btn').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
}

function showGameScreen() {
  document.getElementById('difficulty-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('header-stats').classList.remove('hidden');
  document.getElementById('quit-game-btn').classList.remove('hidden');
}

// ============================================================
//  ゲーム初期化
// ============================================================

function startGame(difficulty) {
  stopTimer();
  hideResult();

  const config = DIFFICULTIES[difficulty];
  if (!config) return;

  // カードリストを生成（各ランク × 4スート）
  const cardList = [];
  for (const rank of config.ranks) {
    for (const suit of ALL_SUITS) {
      cardList.push({ suit, rank });
    }
  }
  shuffle(cardList);

  G = {
    difficulty,
    config,
    cards: cardList.map((c, i) => ({
      id:      i,
      suit:    c.suit,
      rank:    c.rank,
      flipped: false,
      matched: false,
    })),
    flippedIndices: [],          // 現在めくられている（最大２枚）
    matchedCount:   0,           // ペア成立数
    totalPairs:     cardList.length / 2,  // 必要ペア数 = 全枚数 / 2
    moves:          0,
    timerMs:        0,
    timerStart:     null,
    locked:         false,       // 判定アニメーション中はロック
  };

  buildGrid();
  showGameScreen();
  renderStats();
}

// ============================================================
//  グリッド構築
// ============================================================

function buildGrid() {
  const gridEl = document.getElementById('card-grid');
  gridEl.innerHTML = '';
  gridEl.dataset.diff = G.difficulty;

  G.cards.forEach((card, i) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'memory-card';
    cardEl.dataset.index = i;
    cardEl.style.setProperty('--deal-i', i);

    // ---- 3D フリップ構造 ----
    const inner = document.createElement('div');
    inner.className = 'memory-card-inner';

    // 裏面（カード裏の模様）
    const cover = document.createElement('div');
    cover.className = 'card-side card-cover';
    const backImg = document.createElement('img');
    backImg.src = 'images/cards/back.png';
    backImg.alt = 'カード裏面';
    backImg.draggable = false;
    cover.appendChild(backImg);

    // 表面（カード画像）
    const reveal = document.createElement('div');
    reveal.className = 'card-side card-reveal';
    const frontImg = document.createElement('img');
    frontImg.src = (typeof getCardImagePath === 'function') ? getCardImagePath(card.suit, card.rank) : `images/cards/${card.suit}/A000_card/${card.rank}.png`;
    frontImg.alt   = `${card.rank} of ${card.suit}`;
    frontImg.draggable = false;
    reveal.appendChild(frontImg);

    inner.appendChild(cover);
    inner.appendChild(reveal);
    cardEl.appendChild(inner);

    // クリックイベント
    cardEl.addEventListener('click', () => handleCardClick(i));

    gridEl.appendChild(cardEl);
  });
}

// ============================================================
//  ゲームロジック
// ============================================================

function handleCardClick(index) {
  if (!G || G.locked) return;

  const card = G.cards[index];
  if (card.flipped || card.matched) return;
  if (G.flippedIndices.length >= 2) return;

  // 最初の操作でタイマー開始
  if (!G.timerStart && G.flippedIndices.length === 0 && G.moves === 0) {
    startTimer();
  }

  // カードをめくる
  card.flipped = true;
  G.flippedIndices.push(index);
  setCardFlip(index, true);
  playSound('flip');

  // 2枚目をめくったら判定
  if (G.flippedIndices.length === 2) {
    G.moves++;
    renderStats();
    G.locked = true;
    // 少し見せてから判定
    setTimeout(checkMatch, 520);
  }
}

function checkMatch() {
  const [i1, i2] = G.flippedIndices;
  const c1 = G.cards[i1];
  const c2 = G.cards[i2];

  if (c1.rank === c2.rank) {
    // ---- ペア成立 ----
    onMatch(i1, i2);
  } else {
    // ---- ミスマッチ ----
    onMismatch(i1, i2);
  }
}

function onMatch(i1, i2) {
  playSound('match');

  // マッチフラッシュ
  addClassBoth(i1, i2, 'match-flash');

  setTimeout(() => {
    removeClassBoth(i1, i2, 'match-flash');
    G.cards[i1].matched = true;
    G.cards[i2].matched = true;
    G.matchedCount++;
    G.flippedIndices = [];
    G.locked = false;
    // matched クラスを付与 → 透明化
    getCardEl(i1)?.classList.add('matched');
    getCardEl(i2)?.classList.add('matched');
    renderStats();

    if (G.matchedCount === G.totalPairs) {
      handleWin();
    }
  }, 600);
}

function onMismatch(i1, i2) {
  playSound('mismatch');

  addClassBoth(i1, i2, 'mismatch');

  setTimeout(() => {
    removeClassBoth(i1, i2, 'mismatch');
    // 裏面に戻す
    G.cards[i1].flipped = false;
    G.cards[i2].flipped = false;
    setCardFlip(i1, false);
    setCardFlip(i2, false);
    G.flippedIndices = [];
    G.locked = false;
  }, 1100);
}

function handleWin() {
  stopTimer();
  const elapsed = G.timerMs;
  playSound('win');

  const { newBestTime, newBestMoves } = saveRecord(G.difficulty, elapsed, G.moves);

  // ---- コイン付与（ペア数に応じた基本額 + 新記録ボーナス） ----
  const coinsEarned = G.totalPairs * 5 + (newBestTime ? 15 : 0) + (newBestMoves ? 15 : 0);
  const coinsTotal  = (typeof Wallet_addCoins === 'function') ? Wallet_addCoins(coinsEarned) : coinsEarned;
  G.coinsEarned = coinsEarned;
  G.coinsTotal  = coinsTotal;
  updateCoinDisplay();

  setTimeout(() => showResult(elapsed, newBestTime, newBestMoves), 800);
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

// ============================================================
//  DOM 操作
// ============================================================

function setCardFlip(index, faceUp) {
  getCardEl(index)?.classList.toggle('flipped', faceUp);
}

function getCardEl(index) {
  return document.querySelector(`.memory-card[data-index="${index}"]`);
}

function addClassBoth(i1, i2, cls) {
  getCardEl(i1)?.classList.add(cls);
  getCardEl(i2)?.classList.add(cls);
}

function removeClassBoth(i1, i2, cls) {
  getCardEl(i1)?.classList.remove(cls);
  getCardEl(i2)?.classList.remove(cls);
}

function renderStats() {
  if (!G) return;
  const el = (id) => document.getElementById(id);
  if (el('timer-display'))  el('timer-display').textContent  = formatTime(G.timerMs);
  if (el('pairs-display'))  el('pairs-display').textContent  = `${G.matchedCount} / ${G.totalPairs}`;
  if (el('moves-display'))  el('moves-display').textContent  = String(G.moves);
}

// ============================================================
//  難易度選択画面
// ============================================================

function buildDiffPreviews() {
  Object.entries(DIFFICULTIES).forEach(([key, config]) => {
    const container = document.getElementById(`preview-${key}`);
    if (!container) return;

    const total  = config.ranks.length * 4;
    const show   = Math.min(total, 32);
    const cols   = Math.min(config.cols, 8);

    container.style.setProperty('--cols', cols);
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = 0; i < show; i++) {
      const sq = document.createElement('div');
      sq.className = 'mp-sq';
      container.appendChild(sq);
    }
  });
}

function renderDifficultyRecords() {
  ['easy', 'normal', 'hard'].forEach(diff => {
    const rec = getRecord(diff);
    const te = document.getElementById(`best-time-${diff}`);
    const me = document.getElementById(`best-moves-${diff}`);
    if (te) te.textContent = rec.bestTime  !== null ? formatTime(rec.bestTime)  : '—';
    if (me) me.textContent = rec.bestMoves !== null ? `${rec.bestMoves} 手`     : '—';
  });
}

// ============================================================
//  結果画面
// ============================================================

function showResult(elapsed, newBestTime, newBestMoves) {
  const config = DIFFICULTIES[G.difficulty];
  const rec    = getRecord(G.difficulty);

  document.getElementById('result-diff-badge').textContent  = config.label;
  document.getElementById('result-time').textContent         = formatTime(elapsed);
  document.getElementById('result-moves').textContent        = `${G.moves} 手`;

  const tb = document.getElementById('result-time-badge');
  const mb = document.getElementById('result-moves-badge');
  if (tb) tb.textContent = newBestTime  ? '🏆 新記録！' : '';
  if (mb) mb.textContent = newBestMoves ? '🏆 新記録！' : '';

  document.getElementById('result-best-time').textContent  = rec.bestTime  !== null ? formatTime(rec.bestTime)  : '—';
  document.getElementById('result-best-moves').textContent = rec.bestMoves !== null ? `${rec.bestMoves} 手`     : '—';

  const coinsEl = document.getElementById('result-coins');
  if (coinsEl) {
    coinsEl.textContent = `🪙 +${G.coinsEarned ?? 0} コイン獲得！（所持: ${(G.coinsTotal ?? 0).toLocaleString()}）`;
  }

  document.getElementById('result-overlay').classList.remove('hidden');
}

function hideResult() {
  document.getElementById('result-overlay')?.classList.add('hidden');
}

// ============================================================
//  タイマー
// ============================================================

function startTimer() {
  G.timerStart = Date.now();
  timerInterval = setInterval(() => {
    if (!G?.timerStart) return;
    G.timerMs = Date.now() - G.timerStart;
    renderStats();
  }, 100);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (G?.timerStart) {
    G.timerMs    = Date.now() - G.timerStart;
    G.timerStart = null;
  }
}

// ============================================================
//  セーブデータ（localStorage、同キーでソリティアと共存）
// ============================================================

function getRecord(diff) {
  try {
    const data = JSON.parse(localStorage.getItem(MEM_SAVE_KEY) || '{}');
    const r = data?.memory?.[diff];
    return { bestTime: r?.bestTime ?? null, bestMoves: r?.bestMoves ?? null };
  } catch { return { bestTime: null, bestMoves: null }; }
}

function saveRecord(diff, timeMs, moves) {
  try {
    const data = JSON.parse(localStorage.getItem(MEM_SAVE_KEY) || '{}');
    if (!data.memory)       data.memory       = {};
    if (!data.memory[diff]) data.memory[diff] = { bestTime: null, bestMoves: null };

    const rec          = data.memory[diff];
    const newBestTime  = rec.bestTime  === null || timeMs < rec.bestTime;
    const newBestMoves = rec.bestMoves === null || moves  < rec.bestMoves;

    if (newBestTime)  rec.bestTime  = timeMs;
    if (newBestMoves) rec.bestMoves = moves;

    localStorage.setItem(MEM_SAVE_KEY, JSON.stringify(data));
    return { newBestTime, newBestMoves };
  } catch { return { newBestTime: false, newBestMoves: false }; }
}

// ============================================================
//  サウンド (Web Audio API)
// ============================================================

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playTone(ctx, freq, start, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'flip') {
      // カードをめくる音（短い上昇音）
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(850, now + 0.08);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now); osc.stop(now + 0.15);

    } else if (type === 'match') {
      // ペア成立（明るい2音チャイム）
      playTone(ctx, 659.25, now,       0.45, 0.18);
      playTone(ctx, 880,    now + 0.13, 0.55, 0.15);

    } else if (type === 'mismatch') {
      // ミスマッチ（低い短音）
      playTone(ctx, 185, now, 0.22, 0.10, 'triangle');

    } else if (type === 'win') {
      // 全ペア達成ファンファーレ
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        playTone(ctx, freq, now + i * 0.13, 0.55, 0.17);
      });
    }
  } catch (e) { /* ignore */ }
}

// ============================================================
//  ユーティリティ
// ============================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function formatTime(ms) {
  const s   = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
