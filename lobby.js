// ============================================================
//  lobby.js — Card Games Lobby
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  spawnAmbientSuits();
  initGameCardEffects();
  loadSaveStats();  // セーブデータをロビーに表示
  updateCoinDisplay();
  renderDeckPreview(); // 今のデッキの完成絵プレビュー（4スート）
  initSuitBgm();    // スートの絵にマウスオーバーでBGM再生
});

/** ロビー上部に、現在デッキにセットされている各スートの完成絵（合成レイヤー）を表示する */
function renderDeckPreview() {
  if (typeof renderSuitCompositeLayers !== 'function') return;
  document.querySelectorAll('.lobby-deck-preview-imgwrap[data-suit-img]').forEach(wrap => {
    const suit = wrap.dataset.suitImg;
    if (suit) renderSuitCompositeLayers(wrap, suit);
  });
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

// ============================================================
//  浮遊するスーツのアンビエントアニメーション
// ============================================================

const AMBIENT_SUITS = ['♠', '♥', '♣', '♦'];

// スーツごとの色（薄め）
const SUIT_COLORS = {
  '♠': 'rgba(167, 139, 250, 0.08)',
  '♥': 'rgba(248, 113, 113, 0.08)',
  '♣': 'rgba(52, 211, 153, 0.07)',
  '♦': 'rgba(251, 191, 36, 0.08)',
};

function spawnAmbientSuits() {
  const layer = document.getElementById('ambient-layer');
  if (!layer) return;

  const COUNT = 28;

  for (let i = 0; i < COUNT; i++) {
    const suit = AMBIENT_SUITS[i % AMBIENT_SUITS.length];
    const el = document.createElement('span');
    el.className = 'ambient-suit';
    el.textContent = suit;

    const size   = 24 + Math.random() * 56;        // 24px〜80px
    const left   = Math.random() * 100;             // 0〜100vw
    const dur    = 18 + Math.random() * 24;         // 18〜42s
    const delay  = -(Math.random() * dur);          // ランダムなフェーズで開始
    const rot    = (Math.random() - 0.5) * 720;     // ±360deg 回転

    el.style.setProperty('--size',  `${size}px`);
    el.style.setProperty('--color', SUIT_COLORS[suit] || 'rgba(255,255,255,0.05)');
    el.style.setProperty('--dur',   `${dur}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--rot',   `${rot}deg`);
    el.style.left = `${left}%`;

    layer.appendChild(el);
  }
}

// ============================================================
//  ゲームカードのインタラクション
// ============================================================

function initGameCardEffects() {
  // 利用可能カードの ripple エフェクト
  document.querySelectorAll('.game-card.available').forEach(card => {
    card.addEventListener('click', (e) => {
      spawnRipple(card, e);
    });

    // マウス移動で光の傾きエフェクト（パーレックス的な光）
    card.addEventListener('mousemove', (e) => {
      applyTiltEffect(card, e);
    });

    card.addEventListener('mouseleave', () => {
      resetTiltEffect(card);
    });
  });

  // Coming soon カードをクリックしたとき軽くシェイク
  document.querySelectorAll('.game-card.coming-soon').forEach(card => {
    card.addEventListener('click', () => {
      shakeComing(card);
    });
  });
}

// --- Ripple Effect ---
function spawnRipple(card, e) {
  const rect = card.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const ripple = document.createElement('span');
  ripple.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(212, 175, 55, 0.35);
    transform: translate(-50%, -50%);
    animation: ripple-expand 0.6s ease-out forwards;
    pointer-events: none;
    z-index: 10;
  `;

  card.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
}

// Ripple keyframes はJS内でstyleタグとして挿入
(function injectRippleStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ripple-expand {
      to {
        width: 400px;
        height: 400px;
        opacity: 0;
      }
    }
    .game-card {
      overflow: hidden; /* rippleがはみ出さないよう */
    }
  `;
  document.head.appendChild(style);
})();

// --- Tilt / Light Effect ---
function applyTiltEffect(card, e) {
  const rect = card.getBoundingClientRect();
  const cx   = rect.left + rect.width / 2;
  const cy   = rect.top  + rect.height / 2;

  // マウスと中心の差を正規化 (-1〜1)
  const dx = (e.clientX - cx) / (rect.width  / 2);
  const dy = (e.clientY - cy) / (rect.height / 2);

  const rotX = -dy * 6;   // ±6deg チルト
  const rotY =  dx * 6;

  card.style.transform       = `translateY(-10px) scale(1.02) perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  card.style.transitionDuration = '0.1s';

  // グロー位置もマウスに追従
  const glow = card.querySelector('.game-card-glow');
  if (glow) {
    const gx = ((dx + 1) / 2) * 100;  // 0〜100%
    const gy = ((dy + 1) / 2) * 100;
    glow.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(212,175,55,0.22) 0%, transparent 70%)`;
  }
}

function resetTiltEffect(card) {
  card.style.transform       = '';
  card.style.transitionDuration = '';
  const glow = card.querySelector('.game-card-glow');
  if (glow) {
    glow.style.background = '';
  }
}

// --- Coming Soon Shake ---
function shakeComing(card) {
  if (card.dataset.shaking) return;
  card.dataset.shaking = '1';

  const keyframes = [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(4px)' },
    { transform: 'translateX(0)' },
  ];
  const anim = card.animate(keyframes, { duration: 350, easing: 'ease-in-out' });
  anim.onfinish = () => delete card.dataset.shaking;
}

// ============================================================
//  セーブデータをロビーに表示
// ============================================================

function loadSaveStats() {
  // save.js が読み込まれていない場合はスキップ
  if (typeof Solitaire_getRecord !== 'function') return;

  const rec = Solitaire_getRecord();

  const elHighScore = document.getElementById('stat-high-score');
  const elBestMoves = document.getElementById('stat-best-moves');
  const elWins      = document.getElementById('stat-wins');
  const statsBlock  = document.getElementById('solitaire-save-stats');

  if (!elHighScore || !elBestMoves || !elWins) return;

  if (rec.gamesPlayed === 0) {
    // 初回プレイ前 → ブロック全体を非表示にせず「未プレイ」テキストだけ
    elHighScore.textContent = '—';
    elBestMoves.textContent = '—';
    elWins.textContent      = '—';
    if (statsBlock) statsBlock.classList.add('no-data');
    return;
  }

  if (statsBlock) statsBlock.classList.remove('no-data');

  // ハイスコア
  elHighScore.textContent = rec.highScore > 0
    ? rec.highScore.toLocaleString()
    : '—';

  // 最少手数（クリア済みの場合のみ）
  elBestMoves.textContent = rec.bestMoves !== null
    ? `${rec.bestMoves} 手`
    : '—';

  // クリア回数 / プレイ回数
  elWins.textContent = `${rec.gamesWon} / ${rec.gamesPlayed}`;
}


// ============================================================
//  スートBGM — ロビー上部のスート絵にマウスオーバーで再生
// ============================================================

// data-suit の値 → BGMファイルパス（sound/bgm フォルダ内のファイル名の頭にスート名）
const SUIT_BGM_FILES = {
  spades:   'sound/bgm/spades_迷子迷子のお嬢さん.mp3',
  hearts:   'sound/bgm/hearts_MusMus-BGM-167.mp3',
  clubs:    'sound/bgm/clubs_sweet_tooth.mp3',
  diamonds: 'sound/bgm/diamonds_私の薔薇には棘がない_2.mp3',
};

const SUIT_BGM_VOLUME = 0.5;
const SUIT_BGM_FADE_MS = 250;

const suitBgmAudios = {};   // suit -> HTMLAudioElement（一度作ったら使い回す）
let   suitBgmActive  = null; // 現在再生中のスート名

function initSuitBgm() {
  document.querySelectorAll('.lobby-deck-preview-tile[data-suit]').forEach(tile => {
    const suit = tile.dataset.suit;
    if (!SUIT_BGM_FILES[suit]) return;

    tile.addEventListener('mouseenter', () => playSuitBgm(suit));
    tile.addEventListener('mouseleave', () => stopSuitBgm(suit));
  });
}

function getSuitBgmAudio(suit) {
  if (!suitBgmAudios[suit]) {
    const audio = new Audio(SUIT_BGM_FILES[suit]);
    audio.loop    = true;
    audio.volume  = 0;
    audio.preload = 'auto';
    suitBgmAudios[suit] = audio;
  }
  return suitBgmAudios[suit];
}

function playSuitBgm(suit) {
  // 既に別のスートのBGMが鳴っていたら即座に止める
  if (suitBgmActive && suitBgmActive !== suit) {
    stopSuitBgm(suitBgmActive, true);
  }
  suitBgmActive = suit;

  const audio = getSuitBgmAudio(suit);
  audio.play().catch(() => { /* ブラウザの自動再生制限などは無視 */ });
  fadeSuitBgmVolume(audio, SUIT_BGM_VOLUME, SUIT_BGM_FADE_MS);
}

function stopSuitBgm(suit, immediate) {
  const audio = suitBgmAudios[suit];
  if (!audio) return;
  if (suitBgmActive === suit) suitBgmActive = null;

  fadeSuitBgmVolume(audio, 0, immediate ? 80 : SUIT_BGM_FADE_MS, () => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function fadeSuitBgmVolume(audio, target, duration, onDone) {
  clearInterval(audio._suitBgmFadeTimer);

  const start     = audio.volume;
  const startTime = performance.now();

  audio._suitBgmFadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    audio.volume = start + (target - start) * t;
    if (t >= 1) {
      clearInterval(audio._suitBgmFadeTimer);
      if (onDone) onDone();
    }
  }, 30);
}
