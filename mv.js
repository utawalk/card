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
  applyWallpaper();
  buildProgressDots();
  spawnConfetti();
  spawnRisers();
  spawnFeathers();
  spawnPetals();

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

/**
 * MV中ずっと背景に敷く「壁紙」。
 * 各スートの「2」の素材(pitc)は、キャラクターではなく壁紙のような
 * 模様の絵になっているため、ステージの背景として敷き詰める。
 * A・3〜Kのカード素材は周囲が透明なPNGなので、この壁紙が透けて見える。
 * 所持状態(グレー/カラー)に応じた絵を、他のカードと同じ仕組みで自動選択する。
 */
function applyWallpaper() {
  const stage = document.getElementById('mv-stage');
  if (!stage) return;

  const path = (typeof getCardPicturePath === 'function') ? getCardPicturePath(mvSuit, '2') : '';
  if (path) stage.style.backgroundImage = `url("${path}")`;
}

// ============================================================
//  キラキラ紙吹雪演出（現状はダイヤのMVのみ）
// ============================================================

// この配列にスート名を足せば、他のスートにも紙吹雪を追加できる
// ご要望でスペードにも追加(羽毛だけだと寂しいので、ダイヤと同じキラキラの光の粒を追加)
const MV_CONFETTI_SUITS = ['diamonds', 'spades'];

// この配列に入っているスートは、四角形/丸の紙吹雪を出さず、✦の星型だけにする
// (ご要望でスペードは星のみに変更。ダイヤは従来通り四角形/丸+星の両方のまま)
const MV_CONFETTI_STAR_ONLY_SUITS = ['spades'];

const MV_CONFETTI_COLORS = ['#fff2c2', '#fbbf24', '#f5d060', '#ffffff'];
const MV_CONFETTI_COUNT  = 46;

// スートごとに色を変えたい場合はここに追加する(無ければ上のMV_CONFETTI_COLORSを使う)
// ご要望でスペードは黄色系ではなく青系(水色)の光にした
const MV_CONFETTI_COLORS_BY_SUIT = {
  spades: ['#bfe6ff', '#7ecbff', '#dff5ff', '#ffffff'],
};

function spawnConfetti() {
  if (MV_CONFETTI_SUITS.indexOf(mvSuit) === -1) return;

  const layer = document.getElementById('mv-confetti-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const starOnly = MV_CONFETTI_STAR_ONLY_SUITS.indexOf(mvSuit) !== -1;
  const colors   = MV_CONFETTI_COLORS_BY_SUIT[mvSuit] || MV_CONFETTI_COLORS;

  for (let i = 0; i < MV_CONFETTI_COUNT; i++) {
    const isStar = starOnly ? true : Math.random() < 0.35;

    const piece = document.createElement('span');
    piece.className = 'mv-confetti-piece' + (isStar ? ' mv-confetti-star' : '');
    if (isStar) piece.textContent = '✦';

    const size  = isStar ? (10 + Math.random() * 12) : (5 + Math.random() * 7);   // px
    const left  = Math.random() * 100;                                            // vw%
    const dur   = 5 + Math.random() * 6;                                          // 5〜11s
    const delay = -(Math.random() * dur);                                         // ランダムな位相から開始
    const drift = (Math.random() - 0.5) * 140;                                    // 左右の揺れ(px)
    const rot   = 180 + Math.random() * 540;                                      // 回転量(deg)
    const color = colors[Math.floor(Math.random() * colors.length)];

    piece.style.setProperty('--mv-c-size',  `${size}px`);
    piece.style.setProperty('--mv-c-left',  `${left}%`);
    piece.style.setProperty('--mv-c-dur',   `${dur}s`);
    piece.style.setProperty('--mv-c-delay', `${delay}s`);
    piece.style.setProperty('--mv-c-drift', `${drift}px`);
    piece.style.setProperty('--mv-c-rot',   `${rot}deg`);
    piece.style.setProperty('--mv-c-color', color);
    if (!isStar) piece.style.setProperty('--mv-c-radius', Math.random() < 0.5 ? '50%' : '2px');

    layer.appendChild(piece);
  }
}

// ============================================================
//  ハート＋星が下から上に上がっていく演出（現状はハートのMVのみ）
// ============================================================

// この配列にスート名を足せば、他のスートにも同じ演出を追加できる
const MV_RISER_SUITS = ['hearts'];

const MV_RISER_HEART_COLORS = ['var(--mv-accent)', '#ffb3c6', '#ff8fab'];
const MV_RISER_STAR_COLORS  = ['#fff2c2', '#ffffff', '#ffd6e0'];
const MV_RISER_COUNT        = 34;

function spawnRisers() {
  if (MV_RISER_SUITS.indexOf(mvSuit) === -1) return;

  const layer = document.getElementById('mv-riser-layer');
  if (!layer) return;
  layer.innerHTML = '';

  for (let i = 0; i < MV_RISER_COUNT; i++) {
    const isHeart = Math.random() < 0.55;

    const piece = document.createElement('span');
    piece.className = 'mv-riser-piece ' + (isHeart ? 'mv-riser-heart' : 'mv-riser-star');
    piece.textContent = isHeart ? '♥' : '★';

    const size    = isHeart ? (18 + Math.random() * 18) : (10 + Math.random() * 14);    // px
    const left    = Math.random() * 100;                                                 // vw%
    const dur     = isHeart ? (7 + Math.random() * 6) : (5 + Math.random() * 5);         // ハートはゆっくり、星は少し速め（ご要望で全体的に高速化）
    const delay   = -(Math.random() * dur);                                              // ランダムな位相から開始(開始直後から画面に散らばった状態にする)
    const drift   = (Math.random() - 0.5) * 90;                                          // 左右のふわふわ揺れ(px)
    const rot     = (Math.random() - 0.5) * (isHeart ? 24 : 200);                        // ハートはわずかに傾く程度、星はくるくる回る
    const opacity = isHeart ? (0.55 + Math.random() * 0.35) : (0.75 + Math.random() * 0.25);
    const colors  = isHeart ? MV_RISER_HEART_COLORS : MV_RISER_STAR_COLORS;
    const color   = colors[Math.floor(Math.random() * colors.length)];

    piece.style.setProperty('--mv-r-size',    `${size}px`);
    piece.style.setProperty('--mv-r-left',    `${left}%`);
    piece.style.setProperty('--mv-r-dur',     `${dur}s`);
    piece.style.setProperty('--mv-r-delay',   `${delay}s`);
    piece.style.setProperty('--mv-r-drift',   `${drift}px`);
    piece.style.setProperty('--mv-r-rot',     `${rot}deg`);
    piece.style.setProperty('--mv-r-opacity', opacity);
    piece.style.setProperty('--mv-r-color',   color);

    layer.appendChild(piece);
  }
}

// ============================================================
//  鳥の羽毛が舞い落ちる演出（現状はスペードのMVのみ）
// ============================================================

// この配列にスート名を足せば、他のスートにも同じ演出を追加できる
const MV_FEATHER_SUITS = ['spades'];

const MV_FEATHER_COUNT = 9; // ご要望で半分に減らした（元は30→18→9）

function spawnFeathers() {
  if (MV_FEATHER_SUITS.indexOf(mvSuit) === -1) return;

  const layer = document.getElementById('mv-feather-layer');
  if (!layer) return;
  layer.innerHTML = '';

  for (let i = 0; i < MV_FEATHER_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'mv-feather-piece';
    piece.textContent = '🪶';

    const size    = 28 + Math.random() * 22;                  // px（ご要望で一回り大きく。元は18〜34px）
    const left    = Math.random() * 100;                      // vw%
    const dur     = 9 + Math.random() * 7;                     // 9〜16s（天使の羽のようにゆっくり舞い落ちる）
    const delay   = -(Math.random() * dur);                    // ランダムな位相から開始(開始直後から画面に散らばった状態にする)
    const drift1  = 30 + Math.random() * 50;                    // 左右にふわふわ揺れる振れ幅(px)
    const drift2  = -(30 + Math.random() * 50);
    const rot1    = -(10 + Math.random() * 20);                 // 羽毛がゆらゆら傾く角度(deg)
    const rot2    = 10 + Math.random() * 20;
    const opacity = 0.65 + Math.random() * 0.3;

    piece.style.setProperty('--mv-f-size',    `${size}px`);
    piece.style.setProperty('--mv-f-left',    `${left}%`);
    piece.style.setProperty('--mv-f-dur',     `${dur}s`);
    piece.style.setProperty('--mv-f-delay',   `${delay}s`);
    piece.style.setProperty('--mv-f-drift1',  `${drift1}px`);
    piece.style.setProperty('--mv-f-drift2',  `${drift2}px`);
    piece.style.setProperty('--mv-f-rot1',    `${rot1}deg`);
    piece.style.setProperty('--mv-f-rot2',    `${rot2}deg`);
    piece.style.setProperty('--mv-f-opacity', opacity);

    layer.appendChild(piece);
  }
}

// ============================================================
//  花びらがひらひら揺れながら舞う演出（現状はクラブのMVのみ）
// ============================================================

// この配列にスート名を足せば、他のスートにも同じ演出を追加できる
const MV_PETAL_SUITS = ['clubs'];

const MV_PETAL_CHARS  = ['✿', '❀', '✾'];
const MV_PETAL_COLORS = ['#ffb6c1', '#ffd6e0', '#ffffff', '#fbcfe8'];
const MV_PETAL_COUNT  = 38;

function spawnPetals() {
  if (MV_PETAL_SUITS.indexOf(mvSuit) === -1) return;

  const layer = document.getElementById('mv-petal-layer');
  if (!layer) return;
  layer.innerHTML = '';

  for (let i = 0; i < MV_PETAL_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'mv-petal-piece';
    piece.textContent = MV_PETAL_CHARS[Math.floor(Math.random() * MV_PETAL_CHARS.length)];

    const size    = 12 + Math.random() * 14;                   // px
    const left    = Math.random() * 100;                       // vw%
    const dur     = 8 + Math.random() * 6;                      // 8〜14s（ゆったり上昇する）
    const delay   = -(Math.random() * dur);                     // ランダムな位相から開始(開始直後から画面に散らばった状態にする)
    const drift   = (Math.random() - 0.5) * 90;                 // ハートと同様、左右にジグザグせず一方向にふわっと流れる程度(px)
    const rot     = (Math.random() - 0.5) * 40;                 // わずかな傾き(deg)
    const opacity = 0.7 + Math.random() * 0.3;
    const color   = MV_PETAL_COLORS[Math.floor(Math.random() * MV_PETAL_COLORS.length)];

    piece.style.setProperty('--mv-p-size',    `${size}px`);
    piece.style.setProperty('--mv-p-left',    `${left}%`);
    piece.style.setProperty('--mv-p-dur',     `${dur}s`);
    piece.style.setProperty('--mv-p-delay',   `${delay}s`);
    piece.style.setProperty('--mv-p-drift',   `${drift}px`);
    piece.style.setProperty('--mv-p-rot',     `${rot}deg`);
    piece.style.setProperty('--mv-p-opacity', opacity);
    piece.style.setProperty('--mv-p-color',   color);

    layer.appendChild(piece);
  }
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
