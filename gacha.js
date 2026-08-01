// ============================================================
//  gacha.js — カードガチャ
//  コインを消費してガチャを引き、カードのカラー版（A001_card）を
//  ランダムに1枚入手する。入手したカードは自動でデッキにセットされ、
//  以後すべてのゲームでカラー版（パワー2倍）として使われる。
// ============================================================

'use strict';

const GACHA_SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const GACHA_RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const GACHA_SUIT_INFO = {
  spades:   { symbol: '♠', name: 'Spades',   color: '#a78bfa' },
  hearts:   { symbol: '♥', name: 'Hearts',   color: '#f87171' },
  clubs:    { symbol: '♣', name: 'Clubs',    color: '#34d399' },
  diamonds: { symbol: '♦', name: 'Diamonds', color: '#fbbf24' },
};

const GACHA_COST             = 50; // 1回あたりの消費コイン
const GACHA_DUPLICATE_REFUND = 25; // 重複だった場合の還元コイン

let gachaBusy = false;

// ============================================================
//  初期化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  spawnAmbientSuits();
  updateCoinDisplay();
  renderCollectionGrid();

  document.getElementById('gacha-pull-btn')?.addEventListener('click', handlePull);
  document.getElementById('gacha-result-close-btn')?.addEventListener('click', closeResult);
  document.getElementById('gacha-result-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'gacha-result-overlay') closeResult();
  });
});

// 浮遊スーツのアンビエントアニメーション（lobby.js / deck.js に倣う）
function spawnAmbientSuits() {
  const layer = document.getElementById('ambient-layer');
  if (!layer) return;

  const AMBIENT = ['♠', '♥', '♣', '♦'];
  const COLORS  = {
    '♠': 'rgba(167,139,250,0.06)',
    '♥': 'rgba(248,113,113,0.06)',
    '♣': 'rgba(52,211,153,0.05)',
    '♦': 'rgba(251,191,36,0.06)',
  };
  const COUNT = 20;

  for (let i = 0; i < COUNT; i++) {
    const suit = AMBIENT[i % AMBIENT.length];
    const el = document.createElement('span');
    el.className = 'ambient-suit';
    el.textContent = suit;

    const size  = 22 + Math.random() * 48;
    const left  = Math.random() * 100;
    const dur   = 18 + Math.random() * 22;
    const delay = -(Math.random() * dur);
    const rot   = (Math.random() - 0.5) * 720;

    el.style.setProperty('--size',  `${size}px`);
    el.style.setProperty('--color', COLORS[suit] || 'rgba(255,255,255,0.04)');
    el.style.setProperty('--dur',   `${dur}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--rot',   `${rot}deg`);
    el.style.left = `${left}%`;

    layer.appendChild(el);
  }
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

// ============================================================
//  コレクション一覧
// ============================================================

function renderCollectionGrid() {
  const grid = document.getElementById('gacha-collection-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let ownedCount = 0;

  GACHA_SUITS.forEach(suit => {
    GACHA_RANKS.forEach(rank => {
      const owned = (typeof Collection_isOwned === 'function') ? Collection_isOwned(suit, rank) : false;
      if (owned) ownedCount++;

      const cell = document.createElement('div');
      cell.className = 'gacha-cell' + (owned ? ' owned' : '');
      cell.dataset.suit = suit;
      cell.dataset.rank = rank;

      const img = document.createElement('img');
      img.src = (typeof getCardImagePath === 'function') ? getCardImagePath(suit, rank) : `images/cards/${suit}/A000_card/${rank}.png`;
      img.alt = `${rank} of ${suit}`;
      img.loading = 'lazy';
      cell.appendChild(img);

      const power = document.createElement('div');
      power.className = 'gacha-cell-power';
      const p = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(suit, rank) : '';
      power.textContent = `⚡${p}`;
      cell.appendChild(power);

      if (owned) {
        const check = document.createElement('div');
        check.className = 'gacha-cell-check';
        check.textContent = '✓';
        cell.appendChild(check);
      }

      grid.appendChild(cell);
    });
  });

  const progressEl = document.getElementById('gacha-progress');
  if (progressEl) progressEl.textContent = `${ownedCount} / 52`;
}

// ============================================================
//  ガチャを引く
// ============================================================

function handlePull() {
  if (gachaBusy) return;

  if (typeof Wallet_spendCoins !== 'function' || typeof Collection_unlock !== 'function') {
    console.warn('[Gacha] save.js が読み込まれていません');
    return;
  }

  const spend = Wallet_spendCoins(GACHA_COST);
  if (!spend.success) {
    showInsufficientMessage();
    return;
  }

  gachaBusy = true;
  updateCoinDisplay();
  playPullSound();

  const suit = GACHA_SUITS[Math.floor(Math.random() * GACHA_SUITS.length)];
  const rank = GACHA_RANKS[Math.floor(Math.random() * GACHA_RANKS.length)];

  playGachaShakeAnimation(() => {
    const { alreadyOwned } = Collection_unlock(suit, rank);

    let refunded = 0;
    if (alreadyOwned) {
      Wallet_addCoins(GACHA_DUPLICATE_REFUND);
      refunded = GACHA_DUPLICATE_REFUND;
    }
    updateCoinDisplay();

    showResult(suit, rank, alreadyOwned, refunded);
    renderCollectionGrid();

    gachaBusy = false;
  });
}

function showInsufficientMessage() {
  const el = document.getElementById('gacha-insufficient');
  if (!el) return;
  el.classList.remove('show');
  void el.offsetWidth; // リフロー強制で再アニメーション
  el.classList.add('show');

  const btn = document.getElementById('gacha-pull-btn');
  if (btn) {
    btn.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 350, easing: 'ease-in-out' }
    );
  }
}

function playGachaShakeAnimation(callback) {
  const box  = document.getElementById('gacha-box');
  const ring = document.getElementById('gacha-box-ring');
  if (!box) { callback(); return; }

  box.classList.remove('bursting');
  box.classList.add('shaking');
  if (ring) {
    ring.classList.remove('pulsing');
    void ring.offsetWidth; // リフロー強制で再アニメーション
    ring.classList.add('pulsing');
  }

  setTimeout(() => {
    box.classList.remove('shaking');
    box.classList.add('bursting');

    // 弾ける瞬間: 画面フラッシュ + パーティクル爆発 + 衝撃音
    triggerScreenFlash();
    playBurstImpact();
    const rect = box.getBoundingClientRect();
    spawnGachaParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);

    setTimeout(() => {
      box.classList.remove('bursting');
      callback();
    }, 200);
  }, 600);
}

// ============================================================
//  画面フラッシュ・パーティクル演出
// ============================================================

function triggerScreenFlash() {
  const flash = document.getElementById('gacha-flash');
  if (!flash) return;
  flash.classList.remove('flashing');
  void flash.offsetWidth;
  flash.classList.add('flashing');
}

const GACHA_PARTICLE_GLYPHS = ['♠', '♥', '♣', '♦', '✦', '⚡', '✨'];

function spawnGachaParticles(cx, cy) {
  const container = document.getElementById('gacha-particle-layer');
  if (!container) return;

  const count = 28;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'gacha-particle';
    p.textContent = GACHA_PARTICLE_GLYPHS[Math.floor(Math.random() * GACHA_PARTICLE_GLYPHS.length)];

    const angle = (360 / count) * i + (Math.random() - 0.5) * 20;
    const distance = 90 + Math.random() * 160;
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance - 30; // 少し上方向バイアス
    const duration = 550 + Math.random() * 400;
    const size = 14 + Math.random() * 16;
    const colors = ['#a78bfa', '#f87171', '#34d399', '#fbbf24', '#f5d060'];

    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.fontSize = `${size}px`;
    p.style.color = colors[Math.floor(Math.random() * colors.length)];
    p.style.setProperty('--p-dx', `${dx}px`);
    p.style.setProperty('--p-dy', `${dy}px`);
    p.style.setProperty('--p-rot', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--p-duration', `${duration}ms`);

    container.appendChild(p);
    setTimeout(() => p.remove(), duration + 100);
  }
}

const GACHA_CONFETTI_COLORS = ['#f5d060', '#d4af37', '#a78bfa', '#f87171', '#34d399', '#fbbf24', '#ffffff'];

function spawnConfetti() {
  const container = document.getElementById('gacha-confetti-layer');
  if (!container) return;
  container.innerHTML = '';

  const count = 36;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'gacha-confetti-piece';
    const left = Math.random() * 100;
    const delay = Math.random() * 300;
    const duration = 1400 + Math.random() * 900;
    const color = GACHA_CONFETTI_COLORS[Math.floor(Math.random() * GACHA_CONFETTI_COLORS.length)];

    piece.style.left = `${left}%`;
    piece.style.background = color;
    piece.style.animationDelay = `${delay}ms`;
    piece.style.animationDuration = `${duration}ms`;
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';

    container.appendChild(piece);
  }

  setTimeout(() => { container.innerHTML = ''; }, 2500);
}

// ============================================================
//  結果表示
// ============================================================

function showResult(suit, rank, alreadyOwned, refunded) {
  const overlay  = document.getElementById('gacha-result-overlay');
  const box      = document.getElementById('gacha-result-box');
  const img      = document.getElementById('gacha-result-img');
  const nameEl   = document.getElementById('gacha-result-name');
  const powerEl  = document.getElementById('gacha-result-power');
  const badgeEl  = document.getElementById('gacha-result-badge');
  const msgEl    = document.getElementById('gacha-result-message');
  if (!overlay || !box || !img || !nameEl || !powerEl || !badgeEl || !msgEl) return;

  const info  = GACHA_SUIT_INFO[suit];
  const power = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(suit, rank) : '';

  img.src = (typeof getCardImagePath === 'function') ? getCardImagePath(suit, rank) : `images/cards/${suit}/A001_card/${rank}.png`;
  img.alt = `${info.name} ${rank}`;
  // 再生済みの入場アニメーションをリセットして毎回再生されるようにする
  img.style.animation = 'none';
  void img.offsetWidth;
  img.style.animation = '';

  nameEl.textContent = `${info.symbol} ${rank} of ${info.name}`;
  nameEl.style.color = info.color;

  powerEl.innerHTML = `⚡ パワー ${power}`;

  box.classList.toggle('is-new', !alreadyOwned);
  badgeEl.style.animation = 'none';
  void badgeEl.offsetWidth;
  badgeEl.style.animation = '';

  if (alreadyOwned) {
    badgeEl.textContent = '重複';
    badgeEl.className = 'gacha-result-badge dup';
    msgEl.textContent = `このカードは既に所持していました。コイン ${refunded} が還元されました。`;
    playDuplicateSound();
  } else {
    badgeEl.textContent = 'NEW!';
    badgeEl.className = 'gacha-result-badge new';
    msgEl.textContent = 'カラーカードを入手！自動でデッキにセットされました。';
    playNewCardFanfare();
    spawnConfetti();
  }

  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('active'));

  playGachaResultBgm(suit); // 結果ウィンドウを開いたらそのスートのBGMを再生
}

function closeResult() {
  const overlay = document.getElementById('gacha-result-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => overlay.classList.add('hidden'), 250);

  stopGachaResultBgm(); // ウィンドウを閉じたらBGMを止める
}

// ============================================================
//  サウンド (Web Audio API)
// ============================================================

let _gachaAudioCtx = null;

function getGachaAudioCtx() {
  if (!_gachaAudioCtx) _gachaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_gachaAudioCtx.state === 'suspended') _gachaAudioCtx.resume();
  return _gachaAudioCtx;
}

function gachaTone(ctx, freq, start, dur, gain, type = 'sine') {
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

function playPullSound() {
  try {
    const ctx = getGachaAudioCtx();
    const now = ctx.currentTime;
    // 盛り上がる上昇スイープ（シェイク中）
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(140, now);
    sweep.frequency.exponentialRampToValueAtTime(520, now + 0.6);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.09, now + 0.3);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    sweep.start(now);
    sweep.stop(now + 0.7);

    gachaTone(ctx, 220, now, 0.5, 0.12, 'triangle');
    gachaTone(ctx, 330, now + 0.1, 0.4, 0.10, 'triangle');
  } catch (e) { /* AudioContext が使えない環境ではスキップ */ }
}

/** 弾ける瞬間の「ドン！」という衝撃音 */
function playBurstImpact() {
  try {
    const ctx = getGachaAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.start(now); osc.stop(now + 0.32);
  } catch (e) { /* skip */ }
}

function playNewCardFanfare() {
  try {
    const ctx = getGachaAudioCtx();
    const now = ctx.currentTime;
    // メインのファンファーレ
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      gachaTone(ctx, freq, now + i * 0.11, 0.5, 0.16);
    });
    // 締めの豪華な和音 + キラキラ
    const chordTime = now + 0.5;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
      gachaTone(ctx, freq, chordTime, 1.0, 0.12);
    });
    [1567.98, 2093.00, 1567.98].forEach((freq, i) => {
      gachaTone(ctx, freq, chordTime + 0.15 + i * 0.09, 0.35, 0.08, 'sine');
    });
  } catch (e) { /* skip */ }
}

function playDuplicateSound() {
  try {
    const ctx = getGachaAudioCtx();
    const now = ctx.currentTime;
    gachaTone(ctx, 392, now, 0.3, 0.10, 'sine');
  } catch (e) { /* skip */ }
}


// ============================================================
//  結果ウィンドウ用BGM — 引いたカードのスートに応じて再生
// ============================================================

const GACHA_BGM_FILES = {
  spades:   'sound/bgm/spades_迷子迷子のお嬢さん.mp3',
  hearts:   'sound/bgm/hearts_MusMus-BGM-167.mp3',
  clubs:    'sound/bgm/clubs_sweet_tooth.mp3',
  diamonds: 'sound/bgm/diamonds_私の薔薇には棘がない_2.mp3',
};

const GACHA_BGM_VOLUME  = 0.5;
const GACHA_BGM_FADE_MS = 300;

const gachaBgmAudios = {}; // suit -> HTMLAudioElement（使い回し）
let   gachaBgmActive  = null; // 現在再生中のスート名

function getGachaBgmAudio(suit) {
  if (!gachaBgmAudios[suit]) {
    const audio = new Audio(GACHA_BGM_FILES[suit]);
    audio.loop    = true;
    audio.volume  = 0;
    audio.preload = 'auto';
    gachaBgmAudios[suit] = audio;
  }
  return gachaBgmAudios[suit];
}

function playGachaResultBgm(suit) {
  if (!GACHA_BGM_FILES[suit]) return;

  // 別のスートが鳴っていたら止める
  if (gachaBgmActive && gachaBgmActive !== suit) {
    stopGachaResultBgm(true);
  }
  gachaBgmActive = suit;

  const audio = getGachaBgmAudio(suit);
  audio.play().catch(() => { /* 自動再生制限は無視 */ });
  fadeGachaBgmVolume(audio, GACHA_BGM_VOLUME, GACHA_BGM_FADE_MS);
}

function stopGachaResultBgm(immediate) {
  if (!gachaBgmActive) return;
  const audio = gachaBgmAudios[gachaBgmActive];
  gachaBgmActive = null;
  if (!audio) return;

  fadeGachaBgmVolume(audio, 0, immediate ? 100 : GACHA_BGM_FADE_MS, () => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function fadeGachaBgmVolume(audio, target, duration, onDone) {
  clearInterval(audio._gachaBgmFadeTimer);

  const start     = audio.volume;
  const startTime = performance.now();

  audio._gachaBgmFadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    audio.volume = start + (target - start) * t;
    if (t >= 1) {
      clearInterval(audio._gachaBgmFadeTimer);
      if (onDone) onDone();
    }
  }, 30);
}
