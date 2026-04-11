// --- DOM Rendering Logic ---

// ============================================================
//  Card Image Configuration
//  スキン差し替え時はこの変数だけ変更すればOK
// ============================================================
const CARD_IMAGE_DIR = 'images/cards';       // カード画像フォルダ
const CARD_IMAGE_EXT = '.svg';               // 画像拡張子（.png, .jpg, .webp にも変更可）
const CARD_BACK_FILE = 'back';               // 裏面ファイル名（拡張子なし）

/**
 * カードの表面画像URLを返す
 * @param {Card} card
 * @returns {string} 例: "images/cards/hearts_A.svg"
 */
function getCardFaceUrl(card) {
  return `${CARD_IMAGE_DIR}/${card.suit}_${card.rank}${CARD_IMAGE_EXT}`;
}

/**
 * カードの裏面画像URLを返す
 * @returns {string} 例: "images/cards/back.svg"
 */
function getCardBackUrl() {
  return `${CARD_IMAGE_DIR}/${CARD_BACK_FILE}${CARD_IMAGE_EXT}`;
}

// ============================================================
//  Card Element Creation
// ============================================================

/**
 * カードのDOM要素を生成する
 * すべてのカード（表・裏とも）を画像として描画する。
 * スキン差し替えは images/cards/ フォルダの画像を入れ替えるだけでOK。
 */
function createCardElement(card) {
  const el = document.createElement('div');
  el.classList.add('card');
  el.classList.add(card.color);
  el.dataset.id = card.id;

  const img = document.createElement('img');
  img.classList.add('card-img');
  img.draggable = false; // ブラウザのネイティブドラッグを無効化

  if (card.faceUp) {
    img.src = getCardFaceUrl(card);
    img.alt = `${card.rank} of ${card.suit}`;
  } else {
    el.classList.add('face-down');
    img.src = getCardBackUrl();
    img.alt = 'Card back';
  }

  el.appendChild(img);
  return el;
}

// ============================================================
//  Full Render Loop
// ============================================================
function renderBoard() {
  // FLIPアニメーション: 描画前のカードの位置を記憶 (First)
  const oldPositions = new Map();
  document.querySelectorAll('.card').forEach(el => {
    // ドラッグ中のカードはアニメーション対象外とする
    if (el.dataset.id && !el.classList.contains('dragging')) {
      oldPositions.set(el.dataset.id, el.getBoundingClientRect());
    }
  });

  renderStock();
  renderTalon();
  renderFoundations();
  renderTableau();
  updateStats();

  // FLIPアニメーション: 描画後の新しい位置を計算し、アニメーションさせる (Last, Invert, Play)
  document.querySelectorAll('.card').forEach(el => {
    if (el.dataset.id && oldPositions.has(el.dataset.id)) {
      const oldRect = oldPositions.get(el.dataset.id);
      const newRect = el.getBoundingClientRect();
      
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        // 元々設定されているtransform（山札のズレなど）を保持
        const originalTransform = el.style.transform || '';
        
        // 古い位置に逆引き (Invert)
        el.style.transform = `translate(${dx}px, ${dy}px) ${originalTransform}`;
        el.style.transition = 'none';
        el.style.zIndex = '999'; // 移動中は手前に表示
        
        // DOMの変更を確定させる (Force Reflow)
        el.getBoundingClientRect();
        
        // 新しい位置へアニメーション (Play)
        el.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = originalTransform;
        
        // アニメーション完了後にスタイルをクリーンアップ
        setTimeout(() => {
          el.style.transition = '';
          el.style.zIndex = '';
        }, 350);
      }
    }
  });
}

// Render Stock
function renderStock() {
  const stockEl = document.getElementById('stock');
  stockEl.innerHTML = ''; // Clear
  
  if (GameState.stock.length === 0) {
    stockEl.classList.add('empty');
  } else {
    stockEl.classList.remove('empty');
    // Only render the top 3 cards physically to save DOM nodes in large piles
    const displayCount = Math.min(3, GameState.stock.length);
    for (let i = GameState.stock.length - displayCount; i < GameState.stock.length; i++) {
        const card = GameState.stock[i];
        const cardEl = createCardElement(card);
        // Slight stacking effect
        cardEl.style.transform = `translate(${i * 1}px, ${i * -1}px)`;
        stockEl.appendChild(cardEl);
    }
  }
}

// Render Talon
function renderTalon() {
  const talonEl = document.getElementById('talon');
  talonEl.innerHTML = '';
  
  // Show last 3 drawn cards cascading
  const displayCards = GameState.talon.slice(-3);
  displayCards.forEach((card, index) => {
    const cardEl = createCardElement(card);
    // Cascade them to the right
    cardEl.style.left = `${index * 20}px`;
    talonEl.appendChild(cardEl);
  });
}

function renderFoundations() {
  SUITS.forEach((suit, index) => {
    const pileEl = document.getElementById(`foundation-${index}`);
    pileEl.innerHTML = '';
    
    const cards = GameState.foundations[suit];
    if (cards.length > 0) {
      // For foundations, we only strictly need to show the top card visually
      const topRow = Math.max(0, cards.length - 2);
      for(let i = topRow; i < cards.length; i++){
         const card = cards[i];
         const cardEl = createCardElement(card);
         pileEl.appendChild(cardEl);
      }
    }
  });
}

function renderTableau() {
  GameState.tableau.forEach((col, index) => {
    const colEl = document.getElementById(`tableau-${index}`);
    colEl.innerHTML = '';
    
    col.forEach((card, rowIdx) => {
      const cardEl = createCardElement(card);
      
      // Calculate Y offset for stacking
      let yOffset = 0;
      for (let i = 0; i < rowIdx; i++) {
        // If the card above was face down, less spacing
        if (!col[i].faceUp) {
           yOffset += 8; // var(--card-offset-y-hidden)
        } else {
           yOffset += 24; // var(--card-offset-y)
        }
      }
      
      cardEl.style.top = `${yOffset}px`;
      
      // Allow dragging face up cards
      if (card.faceUp) {
         cardEl.draggable = false; // We use custom drag logic
      }
      
      colEl.appendChild(cardEl);
    });
  });
}

function updateStats() {
  document.getElementById('score-display').textContent = `Score: ${GameState.score}`;
  document.getElementById('moves-display').textContent = `Moves: ${GameState.moves}`;
}

function showVictory() {
  const overlay = document.getElementById('victory-overlay');
  document.getElementById('final-score').textContent = `Score: ${GameState.score}`;
  document.getElementById('final-moves').textContent = `Moves: ${GameState.moves}`;
  overlay.classList.remove('hidden');
}

function hideVictory() {
  document.getElementById('victory-overlay').classList.add('hidden');
}

function showDeadlock() {
  document.getElementById('deadlock-overlay').classList.remove('hidden');
}

function hideDeadlock() {
  document.getElementById('deadlock-overlay').classList.add('hidden');
}
