// --- User Interaction & Game Loop ---

document.addEventListener('DOMContentLoaded', initGame);

// ダブルクリック検出用（同じカードIDへの素早い2回目のmouseupを追跡）
let lastClickId = null;
let lastClickTimer = null;
const DBLCLICK_MS = 350;

// 手詰まりチェック用タイマー
let deadlockCheckTimer = null;

// ヒントモード
let hintState = { active: false, cardId: null, timer: null };

// オートファンデーション
let autoFoundationEnabled = false;
let autoFoundationTimer   = null;

// State for custom Drag & Drop
let dragState = {
  isDragging: false,
  origin: null,     // { type: 'tableau', col: 0, index: 5 } or { type: 'talon' }
  cards: [],        // The logical cards being dragged
  elements: [],     // The DOM elements being dragged
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  containerLeft: 0,
  containerTop: 0
};

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// A generic synth beep for UI sounds
function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'pickup') {
    // Quick sharp pop
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } 
  else if (type === 'drop') {
    // Satisfying thud
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    gainNode.gain.setValueAtTime(0.4, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
  else if (type === 'flip') {
    // Light rustle/swish
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

function initGame() {
  document.getElementById('new-game-btn').addEventListener('click', () => {
    playSound('flip');
    startNewGame();
  });
  document.getElementById('play-again-btn').addEventListener('click', () => {
    playSound('flip');
    startNewGame();
  });

  // 手詰まりモーダルのボタン
  document.getElementById('deadlock-new-game-btn').addEventListener('click', () => {
    playSound('flip');
    startNewGame();
  });

  // ヒントボタン
  document.getElementById('hint-btn').addEventListener('click', () => {
    if (hintState.active) {
      clearHint();
    } else {
      showHint();
    }
  });
  
  // Stock click to draw
  document.getElementById('stock').addEventListener('click', handleStockClick);

  // オートファンデーションボタン
  document.getElementById('auto-foundation-btn').addEventListener('click', () => {
    autoFoundationEnabled = !autoFoundationEnabled;
    updateAutoBtn();
    if (autoFoundationEnabled) runAutoFoundation();
  });

  // Setup Mouse Drag & Drop events
  const board = document.getElementById('board');
  board.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // For touch devices
  board.addEventListener('touchstart', handleTouchStart, {passive: false});
  document.addEventListener('touchmove', handleTouchMove, {passive: false});
  document.addEventListener('touchend', handleTouchEnd);

  // ※ dblclick は renderBoard() 後にDOM再構築されるため使えない
  //   → handleMouseUp 内でタイマーベースの自前検出を使う
  
  startNewGame();
}

function startNewGame() {
  hideVictory();
  hideDeadlock();
  clearHint();
  clearTimeout(deadlockCheckTimer);
  clearTimeout(autoFoundationTimer);
  if (typeof resetSuitLayers === 'function') resetSuitLayers();
  dealGame();
  renderBoard();
  if (autoFoundationEnabled) scheduleAutoFoundation();
}

function handleStockClick(e) {
  clearHint();
  playSound('flip');
  drawFromStock();
  renderBoard();
  scheduleDeadlockCheck();
  scheduleAutoFoundation();
}

// --- Interaction Logic (Find Card in State) ---
function findCardInState(id) {
  // Check Talon
  if (GameState.talon.length > 0 && GameState.talon[GameState.talon.length - 1].id === id) {
    return { type: 'talon', card: GameState.talon[GameState.talon.length - 1] };
  }
  
  // Check Foundations
  for (const suit of SUITS) {
    const pile = GameState.foundations[suit];
    if (pile.length > 0 && pile[pile.length - 1].id === id) {
      return { type: 'foundation', suit, card: pile[pile.length - 1] };
    }
  }
  
  // Check Tableau
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    for (let row = 0; row < column.length; row++) {
      if (column[row].id === id && column[row].faceUp) {
        return { type: 'tableau', col, index: row, card: column[row] };
      }
    }
  }
  
  return null;
}

// Check if clicking a tableau column helps auto-flip a face down card
function autoFlipTableau() {
  let changed = false;
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    if (column.length > 0) {
      const topCard = column[column.length - 1];
      if (!topCard.faceUp) {
        topCard.faceUp = true;
        changed = true;
      }
    }
  }
  if (changed) {
    playSound('flip');
  }
  return changed;
}

// --- Drag and Drop Handlers ---

function startDrag(e, targetEl) {
  if (targetEl.classList.contains('face-down')) return;
  
  const id = targetEl.dataset.id;
  const location = findCardInState(id);
  
  if (!location) return; // Not a draggable card
  
  dragState.isDragging = true;
  dragState.origin = location;
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  dragState.startX = clientX;
  dragState.startY = clientY;
  
  const rect = targetEl.getBoundingClientRect();
  dragState.offsetX = clientX - rect.left;
  dragState.offsetY = clientY - rect.top;
  
  const boardRect = document.getElementById('board').getBoundingClientRect();
  dragState.containerLeft = boardRect.left;
  dragState.containerTop = boardRect.top;

  dragState.cards = [];
  dragState.elements = [];

  // Determine what we are dragging (could be multiple cards in Tableau)
  if (location.type === 'tableau') {
    const col = GameState.tableau[location.col];
    dragState.cards = col.slice(location.index); // this card and all above it
    
    // Get all DOM elements
    const colEl = document.getElementById(`tableau-${location.col}`);
    const children = Array.from(colEl.children);
    dragState.elements = children.slice(location.index);
    
  } else {
    // Talon or Foundation (can only drag one card)
    dragState.cards = [location.card];
    dragState.elements = [targetEl];
  }

  // Visual feedback
  dragState.elements.forEach((el, i) => {
    el.classList.add('dragging');
    // Lock size and make absolute to body
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.position = 'fixed';
    
    // Position exactly where it was clicked initially
    el.style.left = `${rect.left}px`;
    // Add cascading offset for stacked tableau cards
    const yOffsetScale = location.type === 'tableau' ? 24 : 0;
    el.style.top = `${rect.top + (i * yOffsetScale)}px`;
    el.style.transform = 'none'; // remove existing stack transforms
  });
  
  playSound('pickup');
}

function performDragMove(clientX, clientY) {
  if (!dragState.isDragging) return;
  
  const x = clientX - dragState.offsetX;
  const baseY = clientY - dragState.offsetY;
  
  dragState.elements.forEach((el, i) => {
    const yOffsetScale = dragState.origin.type === 'tableau' ? 24 : 0;
    el.style.left = `${x}px`;
    el.style.top = `${baseY + (i * yOffsetScale)}px`;
  });
}

function endDrag(e) {
  if (!dragState.isDragging) return;
  
  const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  
  // ドロップ先判定の前に要素を不可視化し、自分自身が elementsFromPoint に干渉しないようにする
  dragState.elements.forEach(el => {
    el.classList.remove('dragging');
    el.style.visibility = 'hidden'; // 一時的に非表示（スペースは保持）
  });

  // Calculate where we dropped it
  const dropTarget = getDropTarget(clientX, clientY);

  // 判定後に可視性だけ戻す（位置情報(fixed)はそのまま残しておくことで、直後のrenderBoardでのFLIPがドロップ位置から綺麗にアニメーションする）
  dragState.elements.forEach(el => {
    el.style.visibility = '';
  });
  
  let moveSuccessful = false;
  
  if (dropTarget) {
    // Attemp Move
    const movingCard = dragState.cards[0]; // The parent card
    
    if (dropTarget.type === 'tableau') {
      const targetCol = GameState.tableau[dropTarget.col];
      const targetCard = targetCol.length > 0 ? targetCol[targetCol.length - 1] : null;
      
      if (canMoveToTableau(movingCard, targetCard)) {
        moveCardsToTableau(dropTarget.col);
        moveSuccessful = true;
      }
      
    } else if (dropTarget.type === 'foundation' && dragState.cards.length === 1) {
      // Can only move 1 card at a time to foundation
      if (canMoveToFoundation(movingCard, dropTarget.suit)) {
        moveCardToFoundation(dropTarget.suit);
        // エフェクト発火（ファンデーションのインデックスを特定する）
        const foundIdx = SUITS.indexOf(dropTarget.suit);
        triggerFoundationEffect(movingCard.suit, movingCard.rank, foundIdx);
        moveSuccessful = true;
      }
    }
  }

  if (moveSuccessful) {
    playSound('drop');
    GameState.moves++;
    autoFlipTableau(); // Auto flip revealed cards
    
    if (checkWinCondition()) {
      showVictory();
    } else {
      scheduleDeadlockCheck();
      scheduleAutoFoundation();
    }
  } else {
    // Play a lighter sound when snapping back
    playSound('flip');
  }

  renderBoard(); // Re-render fixes all DOM states (snap back or snap to complete)
  
  // Cleanup
  dragState.isDragging = false;
  dragState.origin = null;
  dragState.cards = [];
  dragState.elements = [];
}

// ------------------------------------------------

// Remove dragged cards from origin and push to tableau
function moveCardsToTableau(targetColIdx) {
  const cards = removeCardsFromOrigin();
  GameState.tableau[targetColIdx].push(...cards);
  GameState.score += 5; // Reward
}

// Remove dragged card from origin and push to foundation
function moveCardToFoundation(targetSuit) {
  const cards = removeCardsFromOrigin();
  GameState.foundations[targetSuit].push(cards[0]);
  GameState.score += 10; // Reward
}

function removeCardsFromOrigin() {
  const origin = dragState.origin;
  const count = dragState.cards.length;
  
  if (origin.type === 'tableau') {
     return GameState.tableau[origin.col].splice(origin.index, count);
  } else if (origin.type === 'talon') {
     return [GameState.talon.pop()];
  } else if (origin.type === 'foundation') {
     return [GameState.foundations[origin.suit].pop()];
  }
}

// Detect which pile we drop on based on coordinates
function getDropTarget(x, y) {
  const elements = document.elementsFromPoint(x, y);
  
  for (let el of elements) {
    // Check Foundation
    if (el.classList.contains('foundation-pile')) {
      return { type: 'foundation', suit: el.dataset.suit };
    }
    // Check Tableau Empty Slot
    if (el.classList.contains('tableau-pile')) {
      const id = el.id; // "tableau-n"
      const col = parseInt(id.split('-')[1]);
      return { type: 'tableau', col };
    }
    // Check another Card in Tableau
    if (el.classList.contains('card') && !el.classList.contains('dragging')) {
      const id = el.dataset.id;
      const loc = findCardInState(id);
      if (loc && loc.type === 'tableau') {
        return { type: 'tableau', col: loc.col };
      }
      // Or dropping on top of a foundation card
      if (loc && loc.type === 'foundation') {
        return { type: 'foundation', suit: loc.suit };
      }
    }
  }
  return null;
}

// Mouse Event Wrappers
function handleMouseDown(e) {
  let target = e.target.closest('.card');
  if (target) {
    startDrag(e, target);
  }
}

function handleMouseMove(e) {
  if (dragState.isDragging) {
    performDragMove(e.clientX, e.clientY);
  }
}

function handleMouseUp(e) {
  if (dragState.isDragging) {
    clearHint();
    // endDrag の前にカードIDを保存（endDrag後にdragState.cardsがクリアされるため）
    const cardId = dragState.cards.length > 0 ? dragState.cards[0].id : null;

    endDrag(e);

    // タイマーベースのダブルクリック検出
    if (cardId) {
      if (lastClickId === cardId) {
        // 同じカードへの2回目 → ダブルクリック確定
        clearTimeout(lastClickTimer);
        lastClickId = null;
        lastClickTimer = null;
        autoMoveToFoundation(cardId);
      } else {
        // 1回目 → タイマーをセット
        clearTimeout(lastClickTimer);
        lastClickId = cardId;
        lastClickTimer = setTimeout(() => {
          lastClickId = null;
          lastClickTimer = null;
        }, DBLCLICK_MS);
      }
    }
  } else if (e.target.closest('.card')) {
    // Click logic (auto-move to foundation if possible)
    handleCardClick(e.target.closest('.card'));
  }
}

// Touch Event Wrappers
function handleTouchStart(e) {
  let target = e.target.closest('.card');
  if (target) {
    // 山札などの裏向きカードはドラッグ対象外。
    // preventDefaultを呼ばずにスルーすることで確実にclickイベントを発火させる
    if (target.classList.contains('face-down')) return;

    // Only prevent default on cards to allow clicking buttons
    e.preventDefault(); 
    startDrag(e, target);
  }
}

function handleTouchMove(e) {
  if (dragState.isDragging) {
    e.preventDefault(); // Stop scrolling
    performDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}

function handleTouchEnd(e) {
  if (dragState.isDragging) {
    endDrag(e);
  }
}

// Auto-move on click (e.g. double click or single tap behavior)
function handleCardClick(targetEl) {
  const id = targetEl.dataset.id;
  const location = findCardInState(id);
  
  if (!location) return;

  // Can only auto-move if it's the bottom card (no cards on top of it in tableau)
  if (location.type === 'tableau') {
     const col = GameState.tableau[location.col];
     if (location.index !== col.length - 1) return;
  }

  // Try to move to foundation
  const card = location.card;
  if (canMoveToFoundation(card, card.suit)) {
    clearHint();
    // Move it in state
    if (location.type === 'talon') {
      GameState.talon.pop();
    } else if (location.type === 'tableau') {
      GameState.tableau[location.col].pop();
    } else if (location.type === 'foundation') {
      // foundation のカードをクリックしても再度 push しないよう早期リターン
      // (foundation→foundation の移動は無効)
      return;
    }
    GameState.foundations[card.suit].push(card);
    
    playSound('drop');
    GameState.moves++;
    GameState.score += 10;
    // エフェクト発火
    const foundIdx2 = SUITS.indexOf(card.suit);
    triggerFoundationEffect(card.suit, card.rank, foundIdx2);
    autoFlipTableau();
    
    if (checkWinCondition()) {
      showVictory();
    } else {
      scheduleDeadlockCheck();
      scheduleAutoFoundation();
    }
    renderBoard();
  }
}

// --- ダブルクリックでフォンデーションへ自動移動（カードIDで状態から検索） ---
function autoMoveToFoundation(cardId) {
  clearHint();
  const location = findCardInState(cardId);
  if (!location) return;
  if (location.type === 'foundation') return;

  // タブローの場合、一番上のカードだけ移動可能
  if (location.type === 'tableau') {
    const col = GameState.tableau[location.col];
    if (location.index !== col.length - 1) return;
  }

  const card = location.card;
  if (!canMoveToFoundation(card, card.suit)) return;

  // 状態を更新
  if (location.type === 'talon') {
    GameState.talon.pop();
  } else if (location.type === 'tableau') {
    GameState.tableau[location.col].pop();
  }
  GameState.foundations[card.suit].push(card);

  playSound('drop');
  GameState.moves++;
  GameState.score += 10;

  const foundIdx = SUITS.indexOf(card.suit);
  triggerFoundationEffect(card.suit, card.rank, foundIdx);

  autoFlipTableau();

  if (checkWinCondition()) {
    showVictory();
  } else {
    scheduleDeadlockCheck();
    scheduleAutoFoundation();
  }
  renderBoard();
}

// --- 手詰まりチェックを遅延実行（アニメーション完了後に判定） ---
function scheduleDeadlockCheck() {
  clearTimeout(deadlockCheckTimer);
  deadlockCheckTimer = setTimeout(() => {
    if (!checkWinCondition() && checkDeadlock()) {
      showDeadlock();
    }
  }, 900);
}

// ============================================================
//  オートファンデーション
// ============================================================

function updateAutoBtn() {
  const btn = document.getElementById('auto-foundation-btn');
  if (autoFoundationEnabled) {
    btn.textContent = '🤖 AUTO: ON';
    btn.classList.add('auto-active');
  } else {
    btn.textContent = '🤖 AUTO';
    btn.classList.remove('auto-active');
  }
}

function scheduleAutoFoundation() {
  if (!autoFoundationEnabled) return;
  clearTimeout(autoFoundationTimer);
  autoFoundationTimer = setTimeout(() => runAutoFoundation(), 200);
}

/**
 * ファンデーションへ移動できるカードを一枚移動し、
 * まだ移動できるカードがあれば 150ms 後に再導かす
 */
function runAutoFoundation() {
  if (!autoFoundationEnabled) return;
  if (checkWinCondition()) { showVictory(); return; }

  // 移動对象を探す：talon上 → 各tableau列の上端の順
  let card = null;
  let origin = null;

  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    if (canMoveToFoundation(t, t.suit)) { card = t; origin = 'talon'; }
  }

  if (!card) {
    for (let col = 0; col < 7; col++) {
      const column = GameState.tableau[col];
      if (column.length === 0) continue;
      const top = column[column.length - 1];
      if (!top.faceUp) continue;
      if (canMoveToFoundation(top, top.suit)) {
        card = top;
        origin = { type: 'tableau', col };
        break;
      }
    }
  }

  if (!card) return; // 移動できるカードなし

  // 状態を更新
  if (origin === 'talon') {
    GameState.talon.pop();
  } else {
    GameState.tableau[origin.col].pop();
  }
  GameState.foundations[card.suit].push(card);
  GameState.moves++;
  GameState.score += 10;

  playSound('drop');
  triggerFoundationEffect(card.suit, card.rank, SUITS.indexOf(card.suit));
  autoFlipTableau();
  renderBoard();

  if (checkWinCondition()) {
    showVictory();
    return;
  }

  scheduleDeadlockCheck();

  // 次のカードがあれば連鎖する（150ms環境でカードが流れる演出）
  autoFoundationTimer = setTimeout(() => runAutoFoundation(), 150);
}


function showHint() {
  clearHint(); // 念のため前のヒントをクリア

  const hint = findBestHint();
  const btn = document.getElementById('hint-btn');

  if (!hint) {
    // ヒントなし（手なし）の場合、メインの手なし画面を表示する
    showDeadlock();
    return;
  }

  hintState.active = true;
  hintState.cardId = hint.cardId;

  btn.textContent = '✨ ヒント中';
  btn.classList.add('hint-active');

  // カードまたは山札をハイライト
  if (hint.cardId) {
    const el = document.querySelector(`[data-id="${hint.cardId}"]`);
    if (el) el.classList.add('hint-glow');
  } else {
    // stock または stock-recycle → 山札パイルをハイライト
    document.getElementById('stock').classList.add('hint-glow');
  }

  // 5秒後に自動クリア
  hintState.timer = setTimeout(() => clearHint(), 5000);
}

function clearHint() {
  clearTimeout(hintState.timer);
  hintState.active = false;
  hintState.cardId = null;
  hintState.timer = null;

  // ハイライトを全除去
  document.querySelectorAll('.hint-glow').forEach(el => el.classList.remove('hint-glow'));

  // ボタン表示を戻す
  const btn = document.getElementById('hint-btn');
  if (btn) {
    btn.textContent = '💡 ヒント';
    btn.classList.remove('hint-active');
  }
}
