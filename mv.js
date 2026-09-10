'use strict';

// ============================================================
//  mv.js — スートMVページ
//
//  ロビーの各スート画像の下にあるリンク（mv.html?suit=spades など）
//  から開く、そのスート専用のミュージックビデオ風演出ページ。
//
//  やること:
//   - URLの ?suit= で指定されたスートのBGMを流す
//   - そのスートの13枚の素材(pitc。所持状態に応じてグレー/カラーを
//     自動選択 = getCardPicturePath を利用)を、ズーム・パンしながら
//     次々に見せていく
//   - K・Q・J は表示時間を長く、寄りも大きくして「じっくり見せる」
//   - 最後にスート完成絵（all.png）をフィナーレとして見せてからループ
//
//  スマホ(特にiOS Safari)は「ユーザー操作なしの音声自動再生」を
//  ブロックするため、最初に必ずタップさせてから再生を始める。
// ============================================================

const MV_SUIT_META = {
  spades:   { label: 'Spades',   symbol: '♠' },
  hearts:   { label: 'Hearts',   symbol: '♥' },
  clubs:    { label: 'Clubs',    symbol: '♣' },
  diamonds: { label: 'Diamonds', symbol: '♦' },
};

// スートBGM（lobby.js / js/effects.js と同じファイルを使用）
const MV_BGM_FILES = {
  spades:   'sound/bgm/spades_迷子迷子のお嬢さん.mp3',
  hearts:   'sound/bgm/hearts_MusMus-BGM-167.mp3',
  clubs:    'sound/bgm/clubs_sweet_tooth.mp3',
  diamonds: 'sound/bgm/diamonds_私の薔薇には棘がない_2.mp3',
};
const MV_BGM_VOLUME  = 0.55;
const MV_BGM_FADE_MS = 900;

// 再生順（A→K）+ 最後にスート完成絵をフィナーレとして追加
const MV_RANK_ORDER    = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MV_FEATURED_RANKS = ['J', 'Q', 'K']; // 特にじっくり見せたいランク
const MV_SEQUENCE = MV_RANK_ORDER.concat(['FINALE']);

const MV_NORMAL_DURATION_MS   = 2600; // 通常カードの表示時間
const MV_FEATURED_DURATION_MS = 5200; // K・Q・J の表示時間（長め）
const MV_FINALE_DURATION_MS   = 6200; // フィナーレ（完成絵）の表示時間

const MV_MOTION_CLASSES = ['mv-motion-a', 'mv-motion-b', 'mv-motion-c', 'mv-motion-d'];

let mvSuit = null;
let mvAudio = null;
let mvTimer = null;
let mvSeqIndex = 0;
let mvMotionCursor = 0;
let mvStarted = false;
let mvDotEls = [];

document.addEventListener('DOMContentLoaded', initMv);

function initMv() {
  mvSuit = getSuitFromUrl();
  const meta = MV_SUIT_META[mvSuit];

  if (!meta) {
    // スート指定が無い/不正な場合はロビーに戻す
    window.location.href = 'lobby.html';
    return;
  }

  applySuitTheme(meta);
  buildProgressDots();

  const startBtn = document.getElementById('mv-start-btn');
  if (startBtn) startBtn.addEventListener('click', startMv);
}

function getSuitFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const suit = params.get('suit');
  return MV_SUIT_META[suit] ? suit : null;
}

function applySuitTheme(meta) {
  document.title = `${meta.label} MV — Card Games`;
  document.body.classList.add(`mv-suit-${mvSuit}`);

  const symbolEl   = document.getElementById('mv-suit-symbol');
  const labelEl    = document.getElementById('mv-suit-label');
  const startSymEl = document.getElementById('mv-start-symbol');
  const startTitle = document.getElementById('mv-start-title');

  if (symbolEl)   symbolEl.textContent = meta.symbol;
  if (labelEl)    labelEl.textContent  = meta.label;
  if (startSymEl) startSymEl.textContent = meta.symbol;
  if (startTitle) startTitle.textContent = `${meta.label} MV`;
}

// ============================================================
//  開始（タップ後に再生をスタート）
// ============================================================

function startMv() {
  if (mvStarted) return;
  mvStarted = true;

  const overlay = document.getElementById('mv-start-overlay');
  if (overlay) overlay.classList.add('mv-hidden');

  const hud = document.getElementById('mv-hud');
  if (hud) hud.classList.add('mv-hud-visible');

  const progress = document.getElementById('mv-progress');
  if (progress) progress.classList.add('mv-progress-visible');

  playMvBgm();

  mvSeqIndex = 0;
  showMvCard(mvSeqIndex);
}

// ============================================================
//  BGM再生（sound.jsのミュート機能と連動）
// ============================================================

function playMvBgm() {
  if (!MV_BGM_FILES[mvSuit]) return;

  mvAudio = new Audio(MV_BGM_FILES[mvSuit]);
  mvAudio.loop    = true;
  mvAudio.volume  = 0;
  mvAudio.preload = 'auto';
  if (typeof Sound_registerBgmAudio === 'function') Sound_registerBgmAudio(mvAudio);

  mvAudio.play().catch(() => { /* 万一自動再生が弾かれても無視（タップ後なので通常は成功する） */ });
  fadeMvBgm(MV_BGM_VOLUME, MV_BGM_FADE_MS);
}

function fadeMvBgm(target, duration) {
  if (!mvAudio) return;
  clearInterval(mvAudio._mvFadeTimer);

  const start     = mvAudio.volume;
  const startTime = performance.now();

  mvAudio._mvFadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    mvAudio.volume = start + (target - start) * t;
    if (t >= 1) clearInterval(mvAudio._mvFadeTimer);
  }, 30);
}

// ============================================================
//  カード演出（ズーム・パンしながら次々切り替え）
// ============================================================

function getMvImagePath(rank) {
  if (rank === 'FINALE') {
    return (typeof getSuitCompletePicturePath === 'function') ? getSuitCompletePicturePath(mvSuit) : '';
  }
  return (typeof getCardPicturePath === 'function') ? getCardPicturePath(mvSuit, rank) : '';
}

function showMvCard(seqIndex) {
  const rank      = MV_SEQUENCE[seqIndex % MV_SEQUENCE.length];
  const isFinale  = rank === 'FINALE';
  const isFeatured = isFinale || MV_FEATURED_RANKS.indexOf(rank) !== -1;
  const duration  = isFinale ? MV_FINALE_DURATION_MS
                    : isFeatured ? MV_FEATURED_DURATION_MS
                    : MV_NORMAL_DURATION_MS;

  const stage = document.getElementById('mv-stage');
  if (!stage) return;

  const layer = document.createElement('div');
  layer.className = 'mv-card-layer';
  layer.style.setProperty('--mv-dur', `${duration}ms`);

  const img = document.createElement('img');
  img.className = 'mv-card-img';
  img.src = getMvImagePath(rank);
  img.alt = isFinale ? `${mvSuit} complete` : `${mvSuit} ${rank}`;
  img.classList.add(isFinale ? 'mv-motion-finale' : (isFeatured ? 'mv-motion-featured' : pickMotionClass()));
  layer.appendChild(img);

  const badge = document.createElement('div');
  badge.className = 'mv-rank-badge' + (isFeatured ? ' mv-rank-badge-featured' : '');
  badge.textContent = isFinale ? '★ COMPLETE' : rank;
  layer.appendChild(badge);

  // 直前のレイヤーはフェードアウトさせてから片付ける
  const prevLayer = stage.querySelector('.mv-card-layer.mv-current');
  if (prevLayer) {
    prevLayer.classList.remove('mv-current');
    setTimeout(() => prevLayer.remove(), 1000);
  }

  stage.appendChild(layer);
  // 次フレームでクラス付与し、CSSのフェード/ズームを発火させる
  requestAnimationFrame(() => {
    requestAnimationFrame(() => layer.classList.add('mv-current'));
  });

  updateProgressDots(seqIndex);
  preloadNextMvImage(seqIndex);

  clearTimeout(mvTimer);
  mvTimer = setTimeout(() => {
    mvSeqIndex = seqIndex + 1;
    showMvCard(mvSeqIndex);
  }, duration);
}

function pickMotionClass() {
  const cls = MV_MOTION_CLASSES[mvMotionCursor % MV_MOTION_CLASSES.length];
  mvMotionCursor++;
  return cls;
}

function preloadNextMvImage(seqIndex) {
  const nextRank = MV_SEQUENCE[(seqIndex + 1) % MV_SEQUENCE.length];
  const src = getMvImagePath(nextRank);
  if (!src) return;
  const preloadImg = new Image();
  preloadImg.src = src;
}

// ============================================================
//  進行ドット（A〜K + フィナーレ）
// ============================================================

function buildProgressDots() {
  const container = document.getElementById('mv-progress');
  if (!container) return;
  container.innerHTML = '';
  mvDotEls = [];

  MV_SEQUENCE.forEach((rank) => {
    const isFinale   = rank === 'FINALE';
    const isFeatured = isFinale || MV_FEATURED_RANKS.indexOf(rank) !== -1;

    const dot = document.createElement('span');
    dot.className = 'mv-progress-dot'
      + (isFeatured ? ' mv-progress-featured' : '')
      + (isFinale ? ' mv-progress-finale' : '');
    container.appendChild(dot);
    mvDotEls.push(dot);
  });
}

function updateProgressDots(seqIndex) {
  const activeIdx = seqIndex % MV_SEQUENCE.length;
  mvDotEls.forEach((dot, i) => {
    dot.classList.toggle('mv-progress-active', i === activeIdx);
  });
}
