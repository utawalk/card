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

// スーパーオート（山札をめくる以外の手を全自動でおこなうモード）
let superAutoEnabled = false;
let superAutoTimer   = null;
// true の間は「進展のない場札の入れ替え」を1回だけ許可済み（連続実行して無限ループするのを防ぐためのフラグ）
let superAutoShuffleUsed = false;

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
  gainNode.connect(Sound_getDestination(audioCtx));
  
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

  // スーパーオートボタン
  document.getElementById('super-auto-btn').addEventListener('click', () => {
    superAutoEnabled = !superAutoEnabled;
    updateSuperAutoBtn();
    if (superAutoEnabled) {
      superAutoShuffleUsed = false;
      runSuperAuto();
    }
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
  clearTimeout(superAutoTimer);
  if (typeof stopFoundationBgm === 'function') stopFoundationBgm(); // 新しいゲームではファウンデーションBGMをリセット
  if (typeof resetSuitLayers === 'function') resetSuitLayers();
  dealGame();
  renderBoard();
  // ゲーム開始を記録（プレイ回数インクリメント）
  if (typeof Solitaire_onGameStart === 'function') Solitaire_onGameStart();
  if (autoFoundationEnabled) scheduleAutoFoundation();
  if (superAutoEnabled) scheduleSuperAuto();
}

function handleStockClick(e) {
  clearHint();
  playSound('flip');
  drawFromStock();
  renderBoard();
  scheduleDeadlockCheck();
  scheduleAutoFoundation();
  scheduleSuperAuto();
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
      scheduleSuperAuto();
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
  // 場札同士の入れ替えだけでは得点を加算しない（組札に置いたときだけ加点する）
}

// Remove dragged card from origin and push to foundation
function moveCardToFoundation(targetSuit) {
  const cards = removeCardsFromOrigin();
  GameState.foundations[targetSuit].push(cards[0]);
  // カードのパワーを得点として加算（今後カードごとにパワーを変える予定）
  const power1 = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(targetSuit, cards[0].rank) : 10;
  GameState.score += power1;
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
    return;
  }

  // カードでもボタン等でもない場所（盤面の空きスペースなど）をタップした場合。
  // ここで preventDefault しないと、スマホのブラウザは触れた場所に対して
  // 少し遅れて「合成クリック」を発生させる。スーパーオート中は盤面が
  // 自動で再描画されて少しずつレイアウトが動くため、そのタイミングによっては
  // 合成クリックが本来触れていないスーパーオートボタンなどに誤ってヒットし、
  // 「他の場所を触るとスーパーオートが切れる」という不具合につながっていた。
  // ボタン等の本当にクリックさせたい要素の上では preventDefault しない。
  if (!e.target.closest('button, a, input, select, textarea, label')) {
    e.preventDefault();
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
    // カードのパワーを得点として加算（今後カードごとにパワーを変える予定）
    const power2 = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : 10;
    GameState.score += power2;
    // エフェクト発火
    const foundIdx2 = SUITS.indexOf(card.suit);
    triggerFoundationEffect(card.suit, card.rank, foundIdx2);
    autoFlipTableau();
    
    if (checkWinCondition()) {
      showVictory();
    } else {
      scheduleDeadlockCheck();
      scheduleAutoFoundation();
      scheduleSuperAuto();
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
  // カードのパワーを得点として加算（今後カードごとにパワーを変える予定）
  const power3 = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : 10;
  GameState.score += power3;

  const foundIdx = SUITS.indexOf(card.suit);
  triggerFoundationEffect(card.suit, card.rank, foundIdx);

  autoFlipTableau();

  if (checkWinCondition()) {
    showVictory();
  } else {
    scheduleDeadlockCheck();
    scheduleAutoFoundation();
    scheduleSuperAuto();
  }
  renderBoard();
}

// --- 手詰まりチェックを遅延実行（アニメーション完了後に判定） ---
// 以前は「呼ばれるたびにタイマーをリセットする」実装だったため、
// 手詰まり中にプレイヤーが色々なカードを試して連続でドラッグ操作
// （失敗して弾かれる操作も含む）を行うと、タイマーが延々とリセットされ続けて
// 判定が一向に実行されない不具合があった。
// → 呼び出しのたびに独立したタイマーを積む方式にし、確実に一定時間後に
//   判定が実行されるようにする（判定自体は常に最新のGameStateを見るため、
//   複数のタイマーが積まれても無駄撃ちになるだけで害はない）。
function scheduleDeadlockCheck() {
  setTimeout(() => {
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

  if (!card) {
    // オートファンデーションでこれ以上動かせるカードがない。
    // （オートは「フォンデーションへの移動」しか行わないため、これだけでは
    //  手詰まりと確定しない → タブロー間の移動も含めた完全な判定を行う）
    // 本当に手詰まりであれば、待たずにその場で強制的にウィンドウを表示する。
    if (!checkWinCondition() && checkDeadlock()) {
      showDeadlock();
    }
    return;
  }

  // 状態を更新
  if (origin === 'talon') {
    GameState.talon.pop();
  } else {
    GameState.tableau[origin.col].pop();
  }
  GameState.foundations[card.suit].push(card);
  GameState.moves++;
  // カードのパワーを得点として加算（今後カードごとにパワーを変える予定）
  const power4 = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : 10;
  GameState.score += power4;

  playSound('drop');
  triggerFoundationEffect(card.suit, card.rank, SUITS.indexOf(card.suit));
  autoFlipTableau();
  renderBoard();

  if (checkWinCondition()) {
    showVictory();
    return;
  }

  scheduleDeadlockCheck();

  // 次のカードがあれば連鎖する（得点が入ったことがしっかり見えるよう、やや間隔をあけて流れる演出）
  autoFoundationTimer = setTimeout(() => runAutoFoundation(), 320);
}


// ============================================================
//  スーパーオート（山札をめくる操作以外は全自動）
//
//  優先順位:
//   1. 組札(Foundation)へ置けるカード（山札めくり札 / 場札の一番上）
//   2. 場札→場札の移動で、裏向きカードがめくれる（進展のある手、Kは除く）
//   3. めくり札(Talon)→場札への移動（Kは除く）
//   4. Kを空いている場所へ移動する手（他に手がある間は後回しにする）
//   5. 場札の入れ替えのみで進展のない手（Kの移動は含まない。連続実行は1回まで）
//  上記に当てはまらない手（山札をめくる操作など）は自動化せず、プレイヤーの操作を待つ。
//  ※ Kは空いている場所にしか置けないカードのため、他のカードを使った手を
//    優先させたいという要望に合わせて、意図的に優先度4まで後回しにしている。
// ============================================================

function updateSuperAutoBtn() {
  const btn = document.getElementById('super-auto-btn');
  if (!btn) return;
  if (superAutoEnabled) {
    btn.textContent = '🚀 スーパーオート: ON';
    btn.classList.add('auto-active');
  } else {
    btn.textContent = '🚀 スーパーオート';
    btn.classList.remove('auto-active');
  }
}

function scheduleSuperAuto() {
  if (!superAutoEnabled) return;
  superAutoShuffleUsed = false; // 新しい操作が起きたので入れ替えの許可枠をリセット
  clearTimeout(superAutoTimer);
  superAutoTimer = setTimeout(() => runSuperAuto(), 200);
}

/**
 * 次に自動実行すべき手を1つ探す（山札をめくる/リサイクルする手は対象外）
 * @returns {object|null}
 */
function findBestSuperAutoMove() {
  // --- 優先度1: Talon top → Foundation ---
  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    if (canMoveToFoundation(t, t.suit)) {
      return { type: 'talon-to-foundation' };
    }
  }

  // --- 優先度1: Tableau top → Foundation ---
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    if (column.length === 0) continue;
    const top = column[column.length - 1];
    if (top.faceUp && canMoveToFoundation(top, top.suit)) {
      return { type: 'tableau-to-foundation', col };
    }
  }

  // --- 優先度2: Tableau → Tableau（裏向きカードがめくれる手のみ・Kは除く）---
  // Kは空いている場所にしか置けない（=このあとの優先度4で扱う）ため、
  // ここでは「Kを動かして空き場所に置く」以外の、他のカードを使った本当に進展のある手を優先する。
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    let faceUpStart = column.length;
    for (let row = column.length - 1; row >= 0; row--) {
      if (column[row].faceUp) faceUpStart = row; else break;
    }
    if (faceUpStart >= column.length) continue; // 表向きカードなし
    if (faceUpStart === 0) continue; // 動かしても新しいカードはめくれない → 対象外

    const head = column[faceUpStart];
    if (head.value === 13) continue; // Kは優先度4で扱う

    for (let tCol = 0; tCol < 7; tCol++) {
      if (tCol === col) continue;
      const targetTop = GameState.tableau[tCol].length > 0
        ? GameState.tableau[tCol][GameState.tableau[tCol].length - 1] : null;
      if (canMoveToTableau(head, targetTop)) {
        return { type: 'tableau-to-tableau', fromCol: col, index: faceUpStart, toCol: tCol };
      }
    }
  }

  // --- 優先度3: Talon top → Tableau（Kは除く） ---
  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    if (t.value !== 13) {
      for (let col = 0; col < 7; col++) {
        const targetTop = GameState.tableau[col].length > 0
          ? GameState.tableau[col][GameState.tableau[col].length - 1] : null;
        if (canMoveToTableau(t, targetTop)) {
          return { type: 'talon-to-tableau', toCol: col };
        }
      }
    }
  }

  // --- 優先度4: Kを空いている場所へ移動する手（優先度を下げ、他に手がないときだけ実行） ---
  // 4a: 場札のKを動かして裏向きカードをめくる手（進展はあるが、他の手を優先させたいので後回し）
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    let faceUpStart = column.length;
    for (let row = column.length - 1; row >= 0; row--) {
      if (column[row].faceUp) faceUpStart = row; else break;
    }
    if (faceUpStart >= column.length) continue;
    if (faceUpStart === 0) continue; // 裏向きカードがめくれない = 進展なし → 優先度5(またはスキップ)へ

    const head = column[faceUpStart];
    if (head.value !== 13) continue; // Kのみ対象

    for (let tCol = 0; tCol < 7; tCol++) {
      if (tCol === col) continue;
      const targetTop = GameState.tableau[tCol].length > 0
        ? GameState.tableau[tCol][GameState.tableau[tCol].length - 1] : null;
      if (canMoveToTableau(head, targetTop)) {
        return { type: 'tableau-to-tableau', fromCol: col, index: faceUpStart, toCol: tCol };
      }
    }
  }

  // 4b: めくり札のKを空いている場所へ移動する手
  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    if (t.value === 13) {
      for (let col = 0; col < 7; col++) {
        const targetTop = GameState.tableau[col].length > 0
          ? GameState.tableau[col][GameState.tableau[col].length - 1] : null;
        if (canMoveToTableau(t, targetTop)) {
          return { type: 'talon-to-tableau', toCol: col };
        }
      }
    }
  }

  // --- 優先度5: 場札→場札（裏向きカードは増えないが、盤面を動かして次の手を作るための1手）---
  // 「ヒント」はこの種の手も提案するため、スーパーオートも同じ手が見えているのに何もしない、
  // という食い違いを避けたい。ただし同種の手を連続で行うと同じ2枚がずっと往復してしまう恐れが
  // あるため、直前の手が既にこのタイプだった場合（superAutoShuffleUsed）は今回は見送り、
  // 手詰まり判定とプレイヤー操作（ヒント/手動移動/山札クリック）に委ねる。
  // また、Kを空き場所から別の空き場所へ動かすだけの手は何の進展もないため、ここでは対象外にする
  // （ヒント機能も同じ理由でこの手は提案しない）。
  if (!superAutoShuffleUsed) {
    for (let col = 0; col < 7; col++) {
      const column = GameState.tableau[col];
      let faceUpStart = column.length;
      for (let row = column.length - 1; row >= 0; row--) {
        if (column[row].faceUp) faceUpStart = row; else break;
      }
      if (faceUpStart >= column.length) continue; // 表向きカードなし
      if (faceUpStart !== 0) continue; // 裏向きカードが残っている手は優先度2/4で既に判定済み

      const head = column[faceUpStart];
      if (head.value === 13) continue; // 空き場所→空き場所のK移動は無意味なので対象外

      for (let tCol = 0; tCol < 7; tCol++) {
        if (tCol === col) continue;
        const targetTop = GameState.tableau[tCol].length > 0
          ? GameState.tableau[tCol][GameState.tableau[tCol].length - 1] : null;
        if (canMoveToTableau(head, targetTop)) {
          return { type: 'tableau-to-tableau', fromCol: col, index: faceUpStart, toCol: tCol, nonReveal: true };
        }
      }
    }
  }

  return null; // これ以上自動化できる手がない（山札を引く必要がある/手詰まり）
}

/** findBestSuperAutoMove() が返した手を実際に GameState へ適用する */
function executeSuperAutoMove(move) {
  if (move.type === 'talon-to-foundation') {
    const card = GameState.talon.pop();
    GameState.foundations[card.suit].push(card);
    GameState.moves++;
    const power = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : 10;
    GameState.score += power;
    playSound('drop');
    triggerFoundationEffect(card.suit, card.rank, SUITS.indexOf(card.suit));

  } else if (move.type === 'tableau-to-foundation') {
    const card = GameState.tableau[move.col].pop();
    GameState.foundations[card.suit].push(card);
    GameState.moves++;
    const power = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : 10;
    GameState.score += power;
    playSound('drop');
    triggerFoundationEffect(card.suit, card.rank, SUITS.indexOf(card.suit));

  } else if (move.type === 'tableau-to-tableau') {
    const cards = GameState.tableau[move.fromCol].splice(move.index);
    GameState.tableau[move.toCol].push(...cards);
    GameState.moves++;
    // 場札同士の入れ替えだけでは得点を加算しない（組札に置いたときだけ加点する）
    playSound('drop');

  } else if (move.type === 'talon-to-tableau') {
    const card = GameState.talon.pop();
    GameState.tableau[move.toCol].push(card);
    GameState.moves++;
    // めくり札を場札へ置いただけでは得点を加算しない（組札に置いたときだけ加点する）
    playSound('drop');
  }

  autoFlipTableau();
}

/**
 * スーパーオートのメインループ。
 * 自動化できる手がなくなったら停止し、山札をめくる操作（または手詰まり判定）は
 * プレイヤーに委ねる。
 */
function runSuperAuto() {
  if (!superAutoEnabled) return;
  if (checkWinCondition()) { showVictory(); return; }

  const move = findBestSuperAutoMove();

  if (!move) {
    // これ以上の自動操作なし。本当に手詰まりであれば通知する。
    if (!checkWinCondition() && checkDeadlock()) {
      showDeadlock();
    }
    return;
  }

  // 進展のある手が実行できたら、入れ替えの許可枠を回復する。
  // 「進展のない入れ替え」を使った直後は、次に本当に進展する手が出るまでフラグを立てたままにする。
  superAutoShuffleUsed = !!move.nonReveal;

  executeSuperAutoMove(move);
  renderBoard();

  if (checkWinCondition()) {
    showVictory();
    return;
  }

  scheduleDeadlockCheck();

  // 次の自動操作があれば連鎖する（得点が入ったことがしっかり見えるよう、やや間隔をあけて流れる演出）
  superAutoTimer = setTimeout(() => runSuperAuto(), 320);
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
