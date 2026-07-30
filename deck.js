// ============================================================
//  deck.js — Card Gallery（トランプ表面画像 一覧）
// ============================================================

// スートの定義（表示名・記号・フォルダ名・アクセントカラー）
const DECK_SUITS = [
  { key: 'spades',   symbol: '♠', name: 'Spades',   color: '#a78bfa', cssVar: '--spade'   },
  { key: 'hearts',   symbol: '♥', name: 'Hearts',   color: '#f87171', cssVar: '--heart'   },
  { key: 'clubs',    symbol: '♣', name: 'Clubs',    color: '#34d399', cssVar: '--club'    },
  { key: 'diamonds', symbol: '♦', name: 'Diamonds', color: '#fbbf24', cssVar: '--diamond' },
];

// トランプ表面画像のサブフォルダ名（images/cards/{スート}/A001_card/ 配下）
const DECK_CARD_SUBDIR = 'A001_card';

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
  buildGallery();
  initModal();
});

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
    const heading = document.createElement('div');
    heading.className = 'deck-suit-heading';
    heading.innerHTML = `
      <span class="deck-suit-symbol" style="color:${suit.color}">${suit.symbol}</span>
      <span class="deck-suit-name"  style="color:${suit.color}">${suit.name}</span>
      <span class="deck-suit-badge">13 Cards + Complete</span>
    `;
    section.appendChild(heading);

    // ---- カードグリッド ----
    const grid = document.createElement('div');
    grid.className = 'deck-card-grid';

    // 13枚のトランプ表面画像
    DECK_RANKS.forEach((rank, rankIdx) => {
      const power = (typeof getCardPower === 'function') ? getCardPower(suit.key, rank.file) : null;
      const item = createCardItem({
        suit,
        imgSrc:     `images/cards/${suit.key}/${DECK_CARD_SUBDIR}/${rank.file}.png`,
        label:      rank.label,
        power,
        rankIdx,
        isComplete: false,
      });
      item.style.setProperty('--anim-i', String(suitIdx * 14 + rankIdx));
      grid.appendChild(item);
      allCardItems.push(item);
    });

    // Kの右隣に、絵合わせ素材をすべて重ねたときの完成絵 (A001_pitc/all.png) を表示
    const allItem = createCardItem({
      suit,
      imgSrc:     `images/cards/${suit.key}/${DECK_PIC_SUBDIR}/all.png`,
      label:      '✦ Complete',
      power:      null,
      rankIdx:    DECK_RANKS.length,
      isComplete: true,
    });
    allItem.style.setProperty('--anim-i', String(suitIdx * 14 + DECK_RANKS.length));
    grid.appendChild(allItem);
    allCardItems.push(allItem);

    section.appendChild(grid);
    main.appendChild(section);
  });
}

// カードアイテムDOM を生成する
function createCardItem({ suit, imgSrc, label, power, rankIdx, isComplete }) {
  const item = document.createElement('div');
  item.className = 'deck-card-item' + (isComplete ? ' is-complete' : '');
  item.dataset.src   = imgSrc;
  item.dataset.suit  = suit.symbol;
  item.dataset.name  = suit.name;
  item.dataset.label = label;
  item.dataset.color = suit.color;
  item.tabIndex      = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `${suit.name} ${label}を拡大表示`);

  // 完成絵の場合はアクセントボーダーをカスタム色で
  if (isComplete) {
    item.style.setProperty('--suit-color', suit.color);
  }

  // 画像ラッパー
  const imgWrap = document.createElement('div');
  imgWrap.className = 'deck-card-img-wrap';

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

  const item    = allCardItems[index];
  const overlay = document.getElementById('deck-modal');
  const img     = document.getElementById('deck-modal-img');
  const suitEl  = document.getElementById('deck-modal-suit');
  const rankEl  = document.getElementById('deck-modal-rank');
  const counter = document.getElementById('deck-modal-counter');

  currentItemIndex = index;

  // 画像フェード更新
  img.style.opacity = '0';
  img.onload  = () => { img.style.opacity = '1'; };
  img.src     = item.dataset.src;
  img.alt     = `${item.dataset.name} ${item.dataset.label}`;

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
