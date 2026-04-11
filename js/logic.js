// --- Game Core Logic (State Management & Rules) ---

// Constants
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Helper to determine card color
function getCardColor(suit) {
  return (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
}

// Card class to maintain individual card state
class Card {
  constructor(suit, rank, value) {
    this.id = `${suit}-${rank}`;
    this.suit = suit;
    this.rank = rank;
    this.value = value; // 1 for A, 13 for K
    this.color = getCardColor(suit);
    this.faceUp = false;
  }
}

// Global Game State
const GameState = {
  stock: [],
  talon: [],
  foundations: {
    spades: [],
    hearts: [],
    clubs: [],
    diamonds: []
  },
  tableau: [ [], [], [], [], [], [], [] ], // 7 columns
  
  score: 0,
  moves: 0,

  // Reset the entire game state
  reset() {
    this.stock = [];
    this.talon = [];
    this.foundations = { spades: [], hearts: [], clubs: [], diamonds: [] };
    this.tableau = [ [], [], [], [], [], [], [] ];
    this.score = 0;
    this.moves = 0;
  }
};

// --- Core Functions ---

// 1. Create a full deck of 52 cards
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push(new Card(suit, RANKS[i], i + 1));
    }
  }
  return deck;
}

// 2. Fisher-Yates Shuffle
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 3. Deal cards to the board (Tableau and Stock)
function dealGame() {
  GameState.reset();
  const deck = shuffle(createDeck());

  // Deal to Tableau
  // Column 0 gets 1 face up. Column 1 gets 1 face down, 1 face up. ...etc.
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck.pop();
      if (row === col) {
        card.faceUp = true; // Top card is face up
      } else {
        card.faceUp = false;
      }
      GameState.tableau[col].push(card);
    }
  }

  // The rest goes to Stock (Face down)
  while (deck.length > 0) {
    const card = deck.pop();
    card.faceUp = false;
    GameState.stock.push(card);
  }
}

// --- Game Rules & Validation ---

// Check if a move to Tableau is valid
// The moved card must be exactly 1 rank lower and of opposite color to the target card.
function canMoveToTableau(movingCard, targetCard) {
  if (!targetCard) {
    // Empty tableau slot: only Kings can be placed
    return movingCard.value === 13;
  }
  return (movingCard.color !== targetCard.color) && (movingCard.value === targetCard.value - 1);
}

// Check if a move to Foundation is valid
// Must be same suit, and exactly 1 rank higher. Empty gets Ace.
function canMoveToFoundation(movingCard, suit) {
  if (movingCard.suit !== suit) return false;
  
  const foundationPile = GameState.foundations[suit];
  if (foundationPile.length === 0) {
    // Empty foundation needs an Ace (value 1)
    return movingCard.value === 1;
  } else {
    // Must be exactly 1 higher than the current top card
    const topCard = foundationPile[foundationPile.length - 1];
    return movingCard.value === topCard.value + 1;
  }
}

// Draw a card from stock to talon
function drawFromStock() {
  if (GameState.stock.length > 0) {
    const card = GameState.stock.pop();
    card.faceUp = true;
    GameState.talon.push(card);
    GameState.moves++;
  } else {
    // Recycle talon back into stock (face down) if stock is empty
    if (GameState.talon.length > 0) {
      while (GameState.talon.length > 0) {
        const card = GameState.talon.pop();
        card.faceUp = false;
        GameState.stock.push(card);
      }
      GameState.moves++;
    }
  }
}

// Helper to check for Win Condition
function checkWinCondition() {
  const allFoundationsFull = Object.values(GameState.foundations).every(pile => pile.length === 13);
  return allFoundationsFull;
}

// Helper to check for Deadlock (no legal moves remain)
function checkDeadlock() {
  // --- 1. Stock + Talon: 1枚引き形式なので全カードが順番にアクセス可能 ---
  const stockTalonCards = [...GameState.stock, ...GameState.talon];
  for (const card of stockTalonCards) {
    // Foundation へ置ける?
    if (canMoveToFoundation(card, card.suit)) return false;
    // いずれかの Tableau へ置ける?
    for (let col = 0; col < 7; col++) {
      const topCard = GameState.tableau[col].length > 0
        ? GameState.tableau[col][GameState.tableau[col].length - 1] : null;
      if (canMoveToTableau(card, topCard)) return false;
    }
  }

  // --- 2. Tableau の表向きカード（シーケンスごと） ---
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];

    // 表向きカードが始まるインデックスを検出
    let faceUpStart = column.length;
    for (let row = column.length - 1; row >= 0; row--) {
      if (column[row].faceUp) faceUpStart = row;
      else break;
    }

    for (let row = faceUpStart; row < column.length; row++) {
      const card = column[row];

      // 最上段のカードだけ Foundation へ移動可能
      if (row === column.length - 1 && canMoveToFoundation(card, card.suit)) return false;

      // 他の Tableau 列へ移動可能?
      for (let targetCol = 0; targetCol < 7; targetCol++) {
        if (targetCol === col) continue;
        const targetTop = GameState.tableau[targetCol].length > 0
          ? GameState.tableau[targetCol][GameState.tableau[targetCol].length - 1] : null;

        if (canMoveToTableau(card, targetTop)) {
          // 特例: キングを空列へ移動 AND そのキングが列の底 (面下なし) → 無意味な移動なのでスキップ
          if (card.value === 13 && targetTop === null && faceUpStart === 0) continue;
          return false;
        }
      }
    }
  }

  // --- 3. Foundation 上のカードが Tableau へ戻せる? ---
  for (const suit of SUITS) {
    const pile = GameState.foundations[suit];
    if (pile.length === 0) continue;
    const topCard = pile[pile.length - 1];
    for (let col = 0; col < 7; col++) {
      const targetTop = GameState.tableau[col].length > 0
        ? GameState.tableau[col][GameState.tableau[col].length - 1] : null;
      if (canMoveToTableau(topCard, targetTop)) {
        if (topCard.value === 13 && targetTop === null) continue; // Foundation King→空列は無意味
        return false;
      }
    }
  }

  return true; // 手詰まり
}

/**
 * 最も効果的な次の手を返す
 * @returns {{ cardId: string|null, targetType: string } | null}
 *   cardId: ハイライトするカードID（nullのとき山札をハイライト）
 *   targetType: 'foundation' | 'tableau' | 'stock' | 'stock-recycle'
 */
function findBestHint() {
  const candidates = [];

  const getTableauTop = (col) => {
    const col_ = GameState.tableau[col];
    return col_.length > 0 ? col_[col_.length - 1] : null;
  };

  // --- 優先度 100: Foundation へ移動できるカード ---
  // Talon top
  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    if (canMoveToFoundation(t, t.suit))
      candidates.push({ priority: 100, cardId: t.id, targetType: 'foundation' });
  }
  // Tableau top cards
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    if (column.length === 0) continue;
    const top = column[column.length - 1];
    if (top.faceUp && canMoveToFoundation(top, top.suit))
      candidates.push({ priority: 100, cardId: top.id, targetType: 'foundation' });
  }

  // --- 優先度 80: Tableau→Tableau で裏向きカードを開放 ---
  for (let col = 0; col < 7; col++) {
    const column = GameState.tableau[col];
    // 表向き開始インデックスを算出
    let faceUpStart = column.length;
    for (let row = column.length - 1; row >= 0; row--) {
      if (column[row].faceUp) faceUpStart = row; else break;
    }
    if (faceUpStart >= column.length) continue;
    const head = column[faceUpStart];
    const revealsHidden = faceUpStart > 0; // 動かすと下に裏向きが現れる

    for (let tCol = 0; tCol < 7; tCol++) {
      if (tCol === col) continue;
      const targetTop = getTableauTop(tCol);
      if (!canMoveToTableau(head, targetTop)) continue;
      // キングを空列へ移動 & 下に何もない → 意味なし
      if (head.value === 13 && !targetTop && !revealsHidden) continue;
      candidates.push({
        priority: revealsHidden ? 80 : 40,
        cardId: head.id,
        targetType: 'tableau',
      });
    }
  }

  // --- 優先度 60: Talon top → Tableau ---
  if (GameState.talon.length > 0) {
    const t = GameState.talon[GameState.talon.length - 1];
    for (let col = 0; col < 7; col++) {
      const targetTop = getTableauTop(col);
      if (!canMoveToTableau(t, targetTop)) continue;
      // キング→空列は優先度を落とす
      const p = (t.value === 13 && !targetTop) ? 20 : 60;
      candidates.push({ priority: p, cardId: t.id, targetType: 'tableau' });
    }
  }

  // --- 優先度 10: 山札から引く / リサイクル ---
  // stock または talon にある全カードが「実際にどこかへ置けるか」確認してから提案する
  // （置ける手がまったくない場合は山札を光らせても無意味なためスキップ）
  const stockTalonCards = [...GameState.stock, ...GameState.talon];
  const anyStockTalonUseful = stockTalonCards.some(card => {
    if (canMoveToFoundation(card, card.suit)) return true;
    for (let col = 0; col < 7; col++) {
      const top = GameState.tableau[col].length > 0
        ? GameState.tableau[col][GameState.tableau[col].length - 1] : null;
      if (canMoveToTableau(card, top)) return true;
    }
    return false;
  });

  if (anyStockTalonUseful) {
    if (GameState.stock.length > 0) {
      candidates.push({ priority: 10, cardId: null, targetType: 'stock' });
    } else if (GameState.talon.length > 0) {
      candidates.push({ priority: 5, cardId: null, targetType: 'stock-recycle' });
    }
  }

  if (candidates.length === 0) return null;

  // 優先度の高い手を返す（同優先度は最初に見つかったもの）
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}


