// ============================================================
//  deck.js — 今のデッキ（現在セットされているカード一覧）
//  各カードは所持状態に応じてグレー（A000_card・デフォルト）か
//  カラー（A001_card・ガチャ入手済み）で表示される。
// ============================================================

// スートの定義（表示名・記号・フォルダ名・アクセントカラー）
const DECK_SUITS = [
  { key: 'spades',   symbol: '♠', name: 'Spades',   color: '#a78bfa', cssVar: '--spade'   },
  { key: 'hearts',   symbol: '♥', name: 'Hearts',   color: '#f87171', cssVar: '--heart'   },
  { key: 'clubs',    symbol: '♣', name: 'Clubs',    color: '#34d399', cssVar: '--club'    },
  { key: 'diamonds', symbol: '♦', name: 'Diamonds', color: '#fbbf24', cssVar: '--diamond' },
];

// カード表面画像のパスは js/cards.js の getCardImagePath() が
// 所持状態（グレー/カラー）に応じて自動で切り替える

// 絵合わせ素材（完成絵）のサブフォルダ名（images/cards/{スート}/A001_pitc/ 配下）
const DECK_PIC_SUBDIR = 'A001_pitc';

// ランクの定義（ファイル名 / 表示名 のペア）
// パワー（カードの強さ）は js/cards.js の CARD_POWERS で一元管理している
const DECK_RANKS = [
  { file: 'A',  label: 'Ace'   },
  { file: '2',  label: '2'     },
  { file: '3',  label: '3'     },
  { file: '4',  label: '4'     },
  { file: '5',  label: '5'     },
  { file: '6',  label: '6'     },
  { file: '7',  label: '7'     },
  { file: '8',  label: '8'     },
  { file: '9',  label: '9'     },
  { file: '10', label: '10'    },
  { file: 'J',  label: 'Jack'  },
  { file: 'Q',  label: 'Queen' },
  { file: 'K',  label: 'King'  },
];

// ============================================================
//  グローバル状態
// ============================================================

// フラットなカードリスト（モーダルナビ用）
let allCardItems = [];
let currentItemIndex = -1;
let modalOpen = false;

// ============================================================
//  ページ構築
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  spawnAmbientSuits();
  updateCoinDisplay();
  buildGallery();
  updateOwnedProgress();
  renderPowerSummary();
  initModal();
});

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

/** ヘッダーの「カラー化済み枚数」表示を更新する */
function updateOwnedProgress() {
  const el = document.getElementById('deck-owned-progress');
  if (!el) return;
  let owned = 0;
  DECK_SUITS.forEach(suit => {
    DECK_RANKS.forEach(rank => {
      if (typeof Collection_isOwned === 'function' && Collection_isOwned(suit.key, rank.file)) owned++;
    });
  });
  el.textContent = `🎨 ${owned} / 52 枚がカラー化済み`;
}

/** 各スートの合計パワーと、全カードの合計パワーを表示する */
function renderPowerSummary() {
  const container = document.getElementById('deck-power-summary');
  if (!container) return;

  let grandTotal = 0;
  const suitTotals = DECK_SUITS.map(suit => {
    let total = 0;
    DECK_RANKS.forEach(rank => {
      const power = (typeof getEffectiveCardPower === 'function')
        ? getEffectiveCardPower(suit.key, rank.file)
        : 0;
      total += power;
    });
    grandTotal += total;
    return { suit, total };
  });

  container.innerHTML = '';

  suitTotals.forEach(({ suit, total }) => {
    const tile = document.createElement('div');
    tile.className = 'deck-power-tile';
    tile.style.setProperty('--suit-color', suit.color);
    tile.innerHTML = `
      <span class="deck-power-tile-symbol">${suit.symbol}</span>
      <span class="deck-power-tile-label">${suit.name}</span>
      <span class="deck-power-tile-value"><span class="deck-power-tile-icon">⚡</span>${total.toLocaleString()}</span>
    `;
    container.appendChild(tile);
  });

  const totalTile = document.createElement('div');
  totalTile.className = 'deck-power-tile deck-power-tile-total';
  totalTile.innerHTML = `
    <span class="deck-power-tile-symbol">Σ</span>
    <span class="deck-power-tile-label">合計（52枚）</span>
    <span class="deck-power-tile-value"><span class="deck-power-tile-icon">⚡</span>${grandTotal.toLocaleString()}</span>
  `;
  container.appendChild(totalTile);
}

// 浮遊スーツのアンビエントアニメーション（lobby.js に倣う）
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

function buildGallery() {
  const main = document.getElementById('deck-main');
  if (!main) return;

  allCardItems = []; // リセット

  DECK_SUITS.forEach((suit, suitIdx) => {
    const section = document.createElement('section');
    section.className = 'deck-suit-section';
    section.dataset.suit = suit.key;
    section.id = `suit-${suit.key}`;

    // ---- セクション見出し ----
    const suitOwnedCount = DECK_RANKS.filter(r =>
      typeof Collection_isOwned === 'function' && Collection_isOwned(suit.key, r.file)
    ).length;

    const heading = document.createElement('div');
    heading.className = 'deck-suit-heading';
    heading.innerHTML = `
      <span class="deck-suit-symbol" style="color:${suit.color}">${suit.symbol}</span>
      <span class="deck-suit-name"  style="color:${suit.color}">${suit.name}</span>
      <span class="deck-suit-badge">🎨 ${suitOwnedCount} / 13 カラー</span>
    `;
    section.appendChild(heading);

    // ---- カードグリッド ----
    const grid = document.createElement('div');
    grid.className = 'deck-card-grid';

    // 13枚のトランプ表面画像（現在デッキにセットされている見た目＝所持状態で自動切り替え）
    DECK_RANKS.forEach((rank, rankIdx) => {
      const power = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(suit.key, rank.file) : null;
      const owned = (typeof Collection_isOwned === 'function') ? Collection_isOwned(suit.key, rank.file) : false;
      const imgSrc = (typeof getCardImagePath === 'function')
        ? getCardImagePath(suit.key, rank.file)
        : `images/cards/${suit.key}/A000_card/${rank.file}.png`;
      const item = createCardItem({
        suit,
        imgSrc,
        label:      rank.label,
        power,
        owned,
        rankIdx,
        isComplete: false,
      });
      item.style.setProperty('--anim-i', String(suitIdx * 14 + rankIdx));
      grid.appendChild(item);
      allCardItems.push(item);
    });

    // Kの右隣に、「今デッキにセットされている13枚を実際に重ねた」完成絵を表示
    // （Canvas合成は使わず、各カードの絵を<img>として重ねるDOM方式にすることで
    //   file:// で開いた場合でも確実に表示できるようにしている）
    const allItem = createCardItem({
      suit,
      imgSrc:     null, // 完成絵タイルは単一画像ではなく合成レイヤーで表示する
      label:      '✦ Complete',
      power:      null,
      owned:      true, // 完成絵タイルはロック表示の対象外
      rankIdx:    DECK_RANKS.length,
      isComplete: true,
    });
    allItem.style.setProperty('--anim-i', String(suitIdx * 14 + DECK_RANKS.length));
    grid.appendChild(allItem);
    allCardItems.push(allItem);

    if (typeof renderSuitCompositeLayers === 'function') {
      const imgWrap = allItem.querySelector('.deck-card-img-wrap');
      renderSuitCompositeLayers(imgWrap, suit.key);
    }

    section.appendChild(grid);
    main.appendChild(section);
  });
}

// カードアイテムDOM を生成する
function createCardItem({ suit, imgSrc, label, power, owned, rankIdx, isComplete }) {
  const item = document.createElement('div');
  item.className = 'deck-card-item'
    + (isComplete ? ' is-complete' : '')
    + (!isComplete ? (owned ? ' is-owned' : ' is-locked') : '');
  item.dataset.src      = imgSrc || '';
  item.dataset.suit     = suit.symbol;
  item.dataset.suitKey  = suit.key;
  item.dataset.name     = suit.name;
  item.dataset.label    = label;
  item.dataset.color    = suit.color;
  item.dataset.complete = isComplete ? '1' : '';
  item.tabIndex      = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label',
    `${suit.name} ${label}を拡大表示${!isComplete ? (owned ? '（カラー所持済み）' : '（グレー・未入手）') : ''}`);

  // 完成絵の場合はアクセントボーダーをカスタム色で
  if (isComplete) {
    item.style.setProperty('--suit-color', suit.color);
  }

  // 画像ラッパー
  const imgWrap = document.createElement('div');
  imgWrap.className = 'deck-card-img-wrap';

  if (isComplete) {
    // 完成絵タイルは単一画像を使わず、呼び出し側で renderSuitCompositeLayers() により
    // 実際の所持カードの絵を重ねて描画する
  } else {
    const img = document.createElement('img');
    img.className = 'deck-card-img';
    img.src = imgSrc;
    img.alt = `${suit.name} ${label}`;
    img.loading = 'lazy';

    // 画像読み込みエラー時のフォールバック
    img.onerror = () => {
      imgWrap.classList.add('img-error');
      img.style.display = 'none';
      const fallback = document.createElement('div');
      fallback.className = 'deck-card-fallback';
      fallback.innerHTML = `<span>${suit.symbol}</span><small>${label}</small>`;
      fallback.style.color = suit.color;
      imgWrap.appendChild(fallback);
    };

    imgWrap.appendChild(img);
  }

  // 未所持（グレー）カードにはロックバッジを重ねる
  if (!isComplete && !owned) {
    const lock = document.createElement('div');
    lock.className = 'deck-card-lock';
    lock.innerHTML = '<span>🔒</span>';
    imgWrap.appendChild(lock);
  }

  // ラベル
  const lbl = document.createElement('div');
  lbl.className = 'deck-card-label';
  lbl.textContent = label;
  if (isComplete) lbl.style.color = suit.color;

  item.appendChild(imgWrap);
  item.appendChild(lbl);

  // パワー表示（完成絵タイルには表示しない）
  if (power !== null && power !== undefined) {
    const pw = document.createElement('div');
    pw.className = 'deck-card-power';
    pw.innerHTML = `<span class="deck-card-power-icon">⚡</span><span class="deck-card-power-num">${power}</span>`;
    pw.style.setProperty('--suit-color', suit.color);
    item.dataset.power = String(power);
    item.appendChild(pw);
  }

  // クリック / キーボードでモーダルを開く
  item.addEventListener('click', () => {
    const idx = allCardItems.indexOf(item);
    openModal(idx);
  });
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const idx = allCardItems.indexOf(item);
      openModal(idx);
    }
  });

  return item;
}

// ============================================================
//  拡大モーダル
// ============================================================

function initModal() {
  const overlay  = document.getElementById('deck-modal');
  const closeBtn = document.getElementById('deck-modal-close');
  const prevBtn  = document.getElementById('deck-modal-prev');
  const nextBtn  = document.getElementById('deck-modal-next');

  closeBtn.addEventListener('click', closeModal);
  prevBtn.addEventListener('click', () => navigateModal(-1));
  nextBtn.addEventListener('click', () => navigateModal(1));

  // オーバーレイ外クリックで閉じる
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    if (!modalOpen) return;
    if (e.key === 'Escape')     closeModal();
    if (e.key === 'ArrowRight') navigateModal(1);
    if (e.key === 'ArrowLeft')  navigateModal(-1);
  });
}

function openModal(index) {
  if (index < 0 || index >= allCardItems.length) return;

  const item     = allCardItems[index];
  const overlay  = document.getElementById('deck-modal');
  const img      = document.getElementById('deck-modal-img');
  const imgWrap  = document.getElementById('deck-modal-img-wrap');
  const suitEl   = document.getElementById('deck-modal-suit');
  const rankEl   = document.getElementById('deck-modal-rank');
  const counter  = document.getElementById('deck-modal-counter');

  currentItemIndex = index;

  if (item.dataset.complete === '1') {
    // 完成絵: 単一画像ではなく、今デッキにセットされている13枚を重ねて表示する
    img.style.display = 'none';
    if (typeof renderSuitCompositeLayers === 'function' && imgWrap) {
      renderSuitCompositeLayers(imgWrap, item.dataset.suitKey);
    }
  } else {
    if (typeof clearSuitCompositeLayers === 'function' && imgWrap) {
      clearSuitCompositeLayers(imgWrap);
    }
    img.style.display = '';
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; };
    img.src = item.dataset.src;
    img.alt = `${item.dataset.name} ${item.dataset.label}`;
  }

  suitEl.textContent = `${item.dataset.suit} ${item.dataset.name}`;
  suitEl.style.color = item.dataset.color;
  rankEl.textContent = item.dataset.label;
  counter.textContent = `${index + 1} / ${allCardItems.length}`;

  // モーダルのアクセントカラー
  const box = document.getElementById('deck-modal-box');
  box.style.setProperty('--modal-accent', item.dataset.color);

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  modalOpen = true;
}

function closeModal() {
  const overlay = document.getElementById('deck-modal');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  modalOpen = false;

  // フォーカスを元のカードに戻す
  if (currentItemIndex >= 0 && allCardItems[currentItemIndex]) {
    allCardItems[currentItemIndex].focus();
  }
  currentItemIndex = -1;
}

function navigateModal(dir) {
  const newIdx = (currentItemIndex + dir + allCardItems.length) % allCardItems.length;
  openModal(newIdx);
}
