// ============================================================
//  sevens.js — 七並べ (Sevens)
//  ルール:
//    全ての7はゲーム開始時にボードへ。各プレイヤーはスート列を
//    7から両端へ向かって順番に伸ばす。パスは1ゲーム3回まで。
//    手が先になくなったプレイヤーが勝ち。
// ============================================================

'use strict';

// ============================================================
//  定数
// ============================================================

const SUITS      = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS      = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL   = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                     '8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const SUIT_COL   = { spades:'#a78bfa', hearts:'#f87171',
                     clubs:'#34d399',  diamonds:'#fbbf24' };
const PLAYER_NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
const MAX_PASSES   = 3;
const SEVENS_RANK_SCORE_BONUS = [100, 60, 30, 10]; // 最終順位(1位..4位)によるスコアボーナス
const CPU_THINK_MS = 1100;   // CPU 思考演出の時間

// ============================================================
//  ゲーム状態
// ============================================================

let G = {};        // グローバルゲーム状態
let cpuTimer = null;
let autoPlayEnabled = false; // オートプレイON/OFF（ゲームをまたいで保持される）
let autoPlayTimer   = null;

// ============================================================
//  エントリーポイント
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-game-btn').addEventListener('click', newGame);
  document.getElementById('play-again-btn').addEventListener('click', newGame);
  document.getElementById('pass-btn').addEventListener('click', humanPass);
  document.getElementById('redeal-btn').addEventListener('click', handleRedeal);
  document.getElementById('start-game-btn').addEventListener('click', handleStartGame);

  document.getElementById('autoplay-btn')?.addEventListener('click', () => {
    autoPlayEnabled = !autoPlayEnabled;
    updateAutoPlayBtn();
    if (autoPlayEnabled) {
      // ちょうど自分のターン中にONにした場合は、すぐに自動プレイを始める
      if (G && G.status === 'playing' && G.cur === 0) scheduleAutoPlay();
    } else {
      clearTimeout(autoPlayTimer);
      autoPlayTimer = null;
    }
  });

  newGame();
});

// ============================================================
//  ゲーム初期化
// ============================================================

/** ゲーム開始前の「配りなおす」を許可する回数 */
const MAX_REDEALS = 3;
let redealsLeft = MAX_REDEALS;

function newGame() {
  if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
  if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
  closeResult();
  resetSuitPictures();
  stopSevensBgm(); // 新しいゲームではBGMをリセット（最初のカードが置かれるまで無音に戻す）
  updateCoinDisplay();

  redealsLeft = MAX_REDEALS;
  dealHands();

  if (typeof Sevens_onGameStart === 'function') Sevens_onGameStart();
}

/**
 * デッキをシャッフルして4人に配り直す。
 * 配った直後はまだターンを開始せず、'predeal' 状態で待機する
 * （プレイヤーが「配りなおす」か「このカードでプレイ開始」かを選べるようにする）。
 */
function dealHands() {
  // デッキ作成・シャッフル
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, v: RANK_VAL[rank] });
    }
  }
  shuffle(deck);

  // 4人に1枚ずつ交互に配る（合計52枚 / 4 = 13枚ずつ）
  const hands = [[], [], [], []];
  deck.forEach((card, i) => hands[i % 4].push(card));

  // 手札をスート → 数値順にソート
  hands.forEach(h => h.sort((a, b) => {
    const sd = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return sd !== 0 ? sd : a.v - b.v;
  }));

  // 7はゲーム開始時にボードへ置かれるため手札から除去
  const cleanHands = hands.map(h => h.filter(c => c.v !== 7));

  // ボード: スートごとの配置済み範囲 { low, high }（7で初期化）
  const board = {};
  SUITS.forEach(s => {
    board[s] = { low: 7, high: 7 };
    // 7は最初からボードにあるので、絵の土台として静かに登録（演出は出さない）
    suitPicture[s].placed.add('7');
  });

  G = {
    hands:      cleanHands,
    board,
    cur:        0,              // 現在のターン（0=人間）
    passes:     [0, 0, 0, 0],
    eliminated: new Set(),
    finished:   [],             // 上がった順（先頭が1位）
    status:     'predeal',      // 配りなおし選択中（まだゲームは始まっていない）
    score:      0,              // あなたの得点（カードを場に置くとパワー分だけ加算）
  };

  updateScoreDisplay();
  renderAll();
  renderPreDealBar();
}

/** 「配りなおす」ボタン: 残り回数があれば、もう一度4人に配り直す */
function handleRedeal() {
  if (!G || G.status !== 'predeal') return;
  if (redealsLeft <= 0) return;

  redealsLeft--;
  playSound('pass'); // 専用の音は用意せず、既存のパス音を流用
  dealHands();
}

/** 「このカードでプレイ開始」ボタン: 配られた手札のままゲームを始める */
function handleStartGame() {
  if (!G || G.status !== 'predeal') return;

  G.status = 'playing';
  renderPreDealBar();
  renderAll();
  startTurn(0);
}

/** 配りなおし選択バーの表示状態を更新する */
function renderPreDealBar() {
  const bar     = document.getElementById('predeal-bar');
  const infoBar = document.querySelector('.player-info-bar');
  const countEl = document.getElementById('redeal-count');
  const redealBtn = document.getElementById('redeal-btn');
  if (!bar) return;

  const isPreDeal = G.status === 'predeal';
  bar.classList.toggle('hidden', !isPreDeal);
  if (infoBar) infoBar.classList.toggle('hidden', isPreDeal);

  if (isPreDeal) {
    if (countEl)   countEl.textContent = String(redealsLeft);
    if (redealBtn) redealBtn.disabled  = redealsLeft <= 0;
  }
}

// ============================================================
//  ターン制御
// ============================================================

function startTurn(player) {
  G.cur = player;

  // 脱落 or 上がり済み → スキップ
  if (G.eliminated.has(player) || G.finished.includes(player)) {
    advanceTurn();
    return;
  }

  const moves   = validMoves(player);
  const canPass = G.passes[player] < MAX_PASSES;

  // パスも手もなければ脱落
  if (moves.length === 0 && !canPass) {
    eliminate(player);
    advanceTurn();
    return;
  }

  renderAll();

  if (player === 0) {
    enableHuman();
    if (autoPlayEnabled) scheduleAutoPlay();
  } else {
    disableHuman();
    cpuTimer = setTimeout(() => cpuTurn(player), CPU_THINK_MS);
  }
}

function advanceTurn() {
  // ゲーム終了判定
  const active = [0,1,2,3].filter(p => !G.eliminated.has(p) && !G.finished.includes(p));
  if (active.length === 0) { endGame(); return; }

  let next = (G.cur + 1) % 4;
  let guard = 0;
  while ((G.eliminated.has(next) || G.finished.includes(next)) && guard++ < 4) {
    next = (next + 1) % 4;
  }
  startTurn(next);
}

// ============================================================
//  CPU ターン
// ============================================================

function cpuTurn(player) {
  cpuTimer = null;
  if (G.status !== 'playing') return;

  const moves = validMoves(player);

  if (moves.length > 0) {
    // 手がある → 一番よいカードをプレイ
    const card = pickCPUCard(player, moves);
    // 思考演出
    const panel = document.querySelector(`.cpu-panel[data-player="${player}"]`);
    if (panel) panel.classList.add('thinking');
    setTimeout(() => {
      if (panel) panel.classList.remove('thinking');
      doPlay(player, card);
    }, 350);
  } else {
    // 手がない → パス（強制）
    G.passes[player]++;
    renderAll();
    cpuTimer = setTimeout(() => advanceTurn(), 500);
  }
}

/** CPU の戦略：スートが一番少ない・端のカードを優先 */
function pickCPUCard(player, moves) {
  const suitLeft = {};
  SUITS.forEach(s => { suitLeft[s] = G.hands[player].filter(c => c.suit === s).length; });

  let best = moves[0];
  let bestScore = -Infinity;

  for (const c of moves) {
    // スートが少ないほど高スコア（早く空にしたい）
    let score = 14 - suitLeft[c.suit];
    // A か K（端）はボードを伸ばしにくい対戦相手を有利にするので少し優先
    if (c.v === 1 || c.v === 13) score += 2;
    // 手詰まり回避: ボードの端を塞がない選択
    const b = G.board[c.suit];
    if (c.v === b.low - 1 || c.v === b.high + 1) score += 1;
    score += Math.random() * 2.5; // ランダム性
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ============================================================
//  オートプレイ（ONの間、自分の手を自動で選んで出す）
// ============================================================

function updateAutoPlayBtn() {
  const btn = document.getElementById('autoplay-btn');
  if (!btn) return;
  if (autoPlayEnabled) {
    btn.textContent = '🤖 オートプレイ: ON';
    btn.classList.add('auto-active');
  } else {
    btn.textContent = '🤖 オートプレイ';
    btn.classList.remove('auto-active');
  }
}

function scheduleAutoPlay() {
  if (!autoPlayEnabled) return;
  clearTimeout(autoPlayTimer);
  // 少し間を置いてから自動で手を選ぶ（CPUの思考演出と同じ間隔）
  autoPlayTimer = setTimeout(() => runAutoPlay(), CPU_THINK_MS);
}

function runAutoPlay() {
  autoPlayTimer = null;
  if (!autoPlayEnabled) return;
  if (!G || G.status !== 'playing' || G.cur !== 0) return;
  if (G.eliminated.has(0) || G.finished.includes(0)) return;

  const moves = validMoves(0);

  if (moves.length > 0) {
    // CPUと同じ「スートが少ないほど優先」の戦略で手を選ぶ
    const card = pickCPUCard(0, moves);
    doPlay(0, card);
  } else if (G.passes[0] < MAX_PASSES) {
    humanPass();
  }
  // どちらもできない場合は何もしない（startTurn側で自動的に脱落処理される）
}

// ============================================================
//  カードプレイ処理
// ============================================================

function doPlay(player, card) {
  // 手札から除去
  G.hands[player] = G.hands[player].filter(
    c => !(c.suit === card.suit && c.rank === card.rank)
  );

  // ボードを更新
  const b = G.board[card.suit];
  if      (card.v === b.low - 1) b.low  = card.v;
  else if (card.v === b.high + 1) b.high = card.v;

  const isSpecialRank = card.rank === 'A' || card.rank === 'K';
  playSound(isSpecialRank ? 'placeSpecial' : 'place');
  renderAll();
  animateBoardSlot(card);
  triggerSuitPictureReveal(card.suit, card.rank);

  // BGM: 最初に置かれたカードのスートを鳴らし、以後はK・Aが置かれたときだけそのスートに切り替える
  if (!sevensBgmActive || isSpecialRank) {
    playSevensBgm(card.suit);
  }

  // あなたがカードを置いたときだけ、カードのパワーに応じて得点を加算する
  if (player === 0) {
    awardSevensScore(card);
  }

  // 上がり判定
  if (G.hands[player].length === 0) {
    G.finished.push(player);
    if (player === 0) playSound('win');

    const remaining = [0,1,2,3].filter(p => !G.eliminated.has(p) && !G.finished.includes(p));
    if (remaining.length === 0) {
      setTimeout(() => endGame(), 600);
      return;
    }
  }

  advanceTurn();
}

/** 人間のパスボタン */
function humanPass() {
  if (G.cur !== 0 || G.status !== 'playing') return;
  if (G.passes[0] >= MAX_PASSES) return;

  G.passes[0]++;
  playSound('pass');
  renderAll();
  advanceTurn();
}

/** 手札カードのクリック */
function handleCardClick(card) {
  if (G.cur !== 0 || G.status !== 'playing') return;
  if (!isPlayable(card)) return;
  doPlay(0, card);
}

// ============================================================
//  ゲームロジック
// ============================================================

function validMoves(player) {
  return G.hands[player].filter(isPlayable);
}

function isPlayable(card) {
  const b = G.board[card.suit];
  return card.v === b.low - 1 || card.v === b.high + 1;
}

function eliminate(player) {
  G.eliminated.add(player);
  playSound('elim');
  renderAll();

  const el = player === 0
    ? document.getElementById('player-area')
    : document.querySelector(`.cpu-panel[data-player="${player}"]`);
  if (el) el.classList.add('eliminated');
}

function endGame() {
  if (G.status === 'ended') return; // 二重終了処理・コイン二重付与を防止
  G.status = 'ended';
  disableHuman();

  // 残りのアクティブプレイヤーを finished に追加（最後の順位）
  [0,1,2,3]
    .filter(p => !G.eliminated.has(p) && !G.finished.includes(p))
    .forEach(p => G.finished.push(p));

  // 人間が勝った場合のみ win サウンド（doPlay で未再生の場合）
  if (G.finished[0] !== 0) playSound('lose');

  // ---- 最終順位によるスコアボーナス ----
  G.baseScore = G.score;
  const rankBonus = computeSevensRankBonus();
  G.rankBonus = rankBonus;
  if (rankBonus > 0) {
    G.score += rankBonus;
    updateScoreDisplay();
    flashScoreBadge();
  }

  // ---- ハイスコア更新 ----
  const sevensResult = (typeof Sevens_onGameEnd === 'function') ? Sevens_onGameEnd(G.score) : { newHighScore: false };
  G.newHighScore = sevensResult.newHighScore;

  // ---- コイン付与 ----
  const coinsEarned = computeSevensCoins();
  const coinsTotal  = (typeof Wallet_addCoins === 'function') ? Wallet_addCoins(coinsEarned) : coinsEarned;
  G.coinsEarned = coinsEarned;
  G.coinsTotal  = coinsTotal;
  updateCoinDisplay();

  setTimeout(() => showResult(), 800);
}

/** 人間の最終成績に応じてコインを計算する（順位 + 残りパス数ボーナス） */
function computeSevensCoins() {
  if (G.eliminated.has(0)) return 5; // 手詰まりで脱落
  const pos = G.finished.indexOf(0); // 0 = 1位
  const byPos = [80, 50, 25, 10];
  const base = byPos[pos] ?? 10;
  const passBonus = (MAX_PASSES - G.passes[0]) * 5; // パスを使わなかった分だけボーナス
  return base + passBonus;
}

/** 人間の最終順位に応じたスコアボーナスを計算する（脱落時はボーナスなし） */
function computeSevensRankBonus() {
  if (G.eliminated.has(0)) return 0; // 手詰まりで脱落した場合はボーナスなし
  const pos = G.finished.indexOf(0); // 0 = 1位
  return SEVENS_RANK_SCORE_BONUS[pos] ?? 0;
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

// ============================================================
//  得点システム（カードを場に置くとパワーに応じて得点を獲得する）
// ============================================================

/** あなたがカードを場に置いたときに、カードのパワーに応じて得点を加算する */
function awardSevensScore(card) {
  const power = (typeof getEffectiveCardPower === 'function') ? getEffectiveCardPower(card.suit, card.rank) : card.v;
  G.score = (G.score || 0) + power;
  updateScoreDisplay();
  flashScoreBadge();
  spawnSevensScorePopup(card, power);
}

/** ヘッダーのスコア表示を更新する */
function updateScoreDisplay() {
  const el = document.getElementById('score-amount');
  if (el) el.textContent = (G.score ?? 0).toLocaleString();
}

/** スコアバッジを一瞬光らせて、加点したことに気づいてもらいやすくする */
function flashScoreBadge() {
  const badge = document.getElementById('score-badge');
  if (!badge) return;
  badge.classList.remove('score-gain');
  void badge.offsetWidth; // リフロー強制で再アニメーション
  badge.classList.add('score-gain');
}

/** 場に置いたカードの近くに「+パワー」のポップアップを表示する（得点が高いほど目立つ色になる） */
function spawnSevensScorePopup(card, power) {
  const container = document.getElementById('sevens-score-popup-layer');
  if (!container) return;

  const slotsEl = document.getElementById(`slots-${card.suit}`);
  const rankIdx = RANKS.indexOf(card.rank);
  const slot = slotsEl ? slotsEl.children[rankIdx] : null;
  if (!slot) return;

  const rect = slot.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top;

  const scoreTierClass = (typeof getScoreColorTierClass === 'function') ? getScoreColorTierClass(power) : '';

  const text = document.createElement('div');
  text.className = 'sevens-score-popup' + (scoreTierClass ? ' ' + scoreTierClass : '');
  text.textContent = `+${power}`;
  text.style.left = `${cx}px`;
  text.style.top  = `${cy}px`;

  container.appendChild(text);
  setTimeout(() => text.remove(), 1400);
}

// ============================================================
//  描画
// ============================================================

function renderAll() {
  renderBoard();
  renderCPUPanels();
  renderHand();
  renderPlayerStatus();
}

// ---- ボード ----
function renderBoard() {
  SUITS.forEach(suit => {
    const slotsEl = document.getElementById(`slots-${suit}`);
    if (!slotsEl) return;

    // 初回のみスロットDOMを生成
    if (slotsEl.children.length === 0) {
      RANKS.forEach(rank => {
        const slot = document.createElement('div');
        slot.className = 'card-slot';
        slot.dataset.rank = rank;
        slotsEl.appendChild(slot);
      });
    }

    const { low, high } = G.board[suit];

    Array.from(slotsEl.children).forEach((slot, idx) => {
      const rank     = RANKS[idx];
      const v        = RANK_VAL[rank];
      const placed   = v >= low && v <= high;
      const frontier = !placed && (v === low - 1 || v === high + 1);

      // クラスをリセット
      slot.className = 'card-slot';
      if (placed)   slot.classList.add('placed');
      if (v === 7)  slot.classList.add('is-seven');
      if (frontier) slot.classList.add('frontier');

      // 画像 / ラベル の更新
      let img = slot.querySelector('img');
      let lbl = slot.querySelector('.slot-lbl');

      if (placed) {
        if (lbl) lbl.remove();
        if (!img) {
          img = document.createElement('img');
          img.className  = 'board-card-img';
          img.draggable  = false;
          slot.appendChild(img);
        }
        if (img.dataset.rank !== rank || img.dataset.suit !== suit) {
          img.src = (typeof getCardImagePath === 'function') ? getCardImagePath(suit, rank) : `images/cards/${suit}/A000_card/${rank}.png`;
          img.alt = `${rank} of ${suit}`;
          img.dataset.rank = rank;
          img.dataset.suit = suit;
        }
      } else {
        if (img) img.remove();
        if (!lbl) {
          lbl = document.createElement('span');
          lbl.className = 'slot-lbl';
          slot.appendChild(lbl);
        }
        lbl.textContent = rank;
      }
    });
  });
}

// ---- CPU パネル ----
function renderCPUPanels() {
  [1, 2, 3].forEach(player => {
    const panel = document.querySelector(`.cpu-panel[data-player="${player}"]`);
    if (!panel) return;

    panel.classList.toggle('is-current', G.cur === player && G.status === 'playing');
    panel.classList.toggle('eliminated', G.eliminated.has(player));
    panel.classList.toggle('finished',   G.finished.includes(player));

    const countEl  = panel.querySelector('.cpu-card-count');
    const passEl   = panel.querySelector('.cpu-pass-count');
    const statusEl = panel.querySelector('.cpu-status');
    const backsEl  = panel.querySelector('.cpu-card-backs');

    if (countEl) countEl.textContent = `${G.hands[player].length} 枚`;
    if (passEl)  passEl.textContent  = `パス ${G.passes[player]}/${MAX_PASSES}`;

    if (statusEl) {
      if (G.eliminated.has(player)) {
        statusEl.textContent = '脱落 😢';
        statusEl.style.color = '#f87171';
      } else if (G.finished.includes(player)) {
        const pos = G.finished.indexOf(player) + 1;
        const medals = ['🥇','🥈','🥉',''];
        statusEl.textContent = `${medals[pos - 1] || ''} ${pos}位`;
        statusEl.style.color = pos === 1 ? '#fbbf24' : '#8b98b8';
      } else if (G.cur === player && G.status === 'playing') {
        statusEl.textContent = '…';
        statusEl.style.color = '#fbbf24';
      } else {
        statusEl.textContent = '';
      }
    }

    // ミニカード裏面（最大8枚のファン）
    if (backsEl) {
      const n = Math.min(G.hands[player].length, 8);
      // 枚数が変わったときだけ再構築
      if (backsEl.children.length !== n) {
        backsEl.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const img = document.createElement('img');
          img.src = 'images/cards/back.png';
          img.className = 'cpu-back-card';
          img.style.left   = `${i * 10}px`;
          img.style.zIndex = i;
          backsEl.appendChild(img);
        }
      }
    }
  });
}

// ---- 手札 ----
function renderHand() {
  const handEl = document.getElementById('hand-cards');
  if (!handEl) return;
  handEl.innerHTML = '';

  const isMyTurn   = G.cur === 0 && G.status === 'playing' && !G.eliminated.has(0);
  const myMoves    = isMyTurn ? validMoves(0) : [];
  const playSet    = new Set(myMoves.map(c => `${c.suit}_${c.rank}`));
  const noMoves    = isMyTurn && myMoves.length === 0;

  G.hands[0].forEach((card, idx) => {
    const key      = `${card.suit}_${card.rank}`;
    const playable = playSet.has(key);

    const cardEl = document.createElement('div');
    cardEl.className = 'hand-card deal-in';
    cardEl.style.animationDelay = `${idx * 0.04}s`;

    if (isMyTurn) {
      cardEl.classList.toggle('playable',   playable);
      cardEl.classList.toggle('unplayable', !playable);
    }

    const img = document.createElement('img');
    img.src       = (typeof getCardImagePath === 'function') ? getCardImagePath(card.suit, card.rank) : `images/cards/${card.suit}/A000_card/${card.rank}.png`;
    img.alt       = `${card.rank} of ${card.suit}`;
    img.draggable = false;
    cardEl.appendChild(img);

    if (playable && isMyTurn) {
      cardEl.addEventListener('click', () => handleCardClick(card));
    }

    handEl.appendChild(cardEl);
  });

  // 手がなく、パスできる場合は点滅ヒント
  const passBtn = document.getElementById('pass-btn');
  if (noMoves && passBtn && !passBtn.disabled) {
    passBtn.classList.add('pulse-hint');
  } else if (passBtn) {
    passBtn.classList.remove('pulse-hint');
  }
}

// ---- プレイヤー状態 ----
function renderPlayerStatus() {
  const passBtn   = document.getElementById('pass-btn');
  const remainEl  = document.getElementById('passes-remaining');
  const turnEl    = document.getElementById('turn-indicator');

  const remaining = MAX_PASSES - G.passes[0];

  if (remainEl) remainEl.textContent = `パス残り ${remaining} 回`;

  if (passBtn) {
    const canPass = G.cur === 0 && G.status === 'playing'
                  && G.passes[0] < MAX_PASSES && !G.eliminated.has(0);
    passBtn.disabled   = !canPass;
    passBtn.textContent = `パス（残り ${remaining} 回）`;
    passBtn.classList.toggle('pass-zero', remaining === 0);
  }

  if (turnEl) {
    if (G.status === 'predeal') {
      turnEl.textContent = '🎴 手札を確認してください';
      turnEl.className   = 'turn-indicator';
      return;
    }
    if (G.status !== 'playing') {
      turnEl.textContent = '';
      turnEl.className   = 'turn-indicator';
      return;
    }
    if (G.eliminated.has(0)) {
      turnEl.textContent = '😢 脱落';
      turnEl.className   = 'turn-indicator';
    } else if (G.finished.includes(0)) {
      const pos = G.finished.indexOf(0) + 1;
      turnEl.textContent = `${pos}位でゴール！`;
      turnEl.className   = 'turn-indicator';
    } else if (G.cur === 0) {
      turnEl.textContent = '🟢 あなたのターン';
      turnEl.className   = 'turn-indicator my-turn';
    } else {
      turnEl.textContent = `⏳ ${PLAYER_NAMES[G.cur]} のターン`;
      turnEl.className   = 'turn-indicator cpu-turn';
    }
  }
}

function enableHuman() {
  document.getElementById('player-area')?.classList.remove('disabled');
}

function disableHuman() {
  document.getElementById('player-area')?.classList.add('disabled');
}

// ---- ボードスロットのアニメーション ----
function animateBoardSlot(card) {
  const slotsEl = document.getElementById(`slots-${card.suit}`);
  if (!slotsEl) return;
  const rankIdx = RANKS.indexOf(card.rank);
  const slot = slotsEl.children[rankIdx];
  if (!slot) return;
  slot.classList.remove('just-placed');
  // リフロー強制して再アニメーション
  void slot.offsetWidth;
  slot.classList.add('just-placed');
  setTimeout(() => slot.classList.remove('just-placed'), 500);
}

// ============================================================
//  結果画面
// ============================================================

function showResult() {
  const overlay   = document.getElementById('result-overlay');
  const titleEl   = document.getElementById('result-title');
  const subEl     = document.getElementById('result-sub');
  const rankingEl = document.getElementById('result-ranking');
  const iconEl    = document.getElementById('result-icon');

  const humanPos  = G.finished.indexOf(0);
  const humanElim = G.eliminated.has(0);

  // 結果画面が表示される瞬間に、結果に応じたジングルを鳴らす
  playResultJingle(humanElim ? 'elim' : (humanPos === 0 ? 'win' : 'place'));

  // アイコン & タイトル
  if (iconEl) {
    iconEl.textContent = humanElim ? '😓'
      : humanPos === 0 ? '🏆'
      : humanPos === 1 ? '🥈'
      : humanPos === 2 ? '🥉'
      : '😅';
  }
  if (titleEl) {
    titleEl.textContent = humanElim     ? '脱落しました…'
      : humanPos === 0                  ? '1位！おめでとう！🎉'
      : `${humanPos + 1}位でした！`;
  }
  if (subEl) {
    subEl.textContent = humanPos === 0
      ? 'すべてのカードを見事に並べました！'
      : humanElim ? 'パスが尽きて脱落しました。再挑戦してみよう！'
      : '';
  }

  // ランキング
  if (rankingEl) {
    rankingEl.innerHTML = '';
    const medals = ['🥇','🥈','🥉',''];

    G.finished.forEach((player, i) => {
      const li = document.createElement('div');
      li.className = 'ranking-row' + (player === 0 ? ' you' : '');
      li.innerHTML = `
        <span class="rk-pos">${medals[i] || (i+1)+'位'}  ${i+1}位</span>
        <span class="rk-name">${PLAYER_NAMES[player]}${player === 0 ? ' 👤' : ''}</span>
        <span class="rk-pass">パス ${G.passes[player]}/${MAX_PASSES}</span>
      `;
      rankingEl.appendChild(li);
    });

    G.eliminated.forEach(player => {
      const li = document.createElement('div');
      li.className = 'ranking-row' + (player === 0 ? ' you' : '');
      li.innerHTML = `
        <span class="rk-pos">💀 脱落</span>
        <span class="rk-name">${PLAYER_NAMES[player]}${player === 0 ? ' 👤' : ''}</span>
        <span class="rk-pass">パス ${G.passes[player]}/${MAX_PASSES}</span>
      `;
      rankingEl.appendChild(li);
    });
  }

  const scoreEl = document.getElementById('result-score');
  if (scoreEl) {
    const rankBonus = G.rankBonus ?? 0;
    const base = rankBonus > 0
      ? `⚡ 獲得スコア ${(G.baseScore ?? 0).toLocaleString()} ＋ 順位ボーナス ${rankBonus.toLocaleString()} ＝ ${(G.score ?? 0).toLocaleString()}`
      : `⚡ 獲得スコア: ${(G.score ?? 0).toLocaleString()}`;
    scoreEl.textContent = G.newHighScore ? `${base} 🏆 新記録！` : base;
  }

  const coinsEl = document.getElementById('result-coins');
  if (coinsEl) {
    coinsEl.textContent = `🪙 +${G.coinsEarned ?? 0} コイン獲得！（所持: ${(G.coinsTotal ?? 0).toLocaleString()}）`;
  }

  if (overlay) overlay.classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-overlay')?.classList.add('hidden');
}

// ============================================================
//  サウンド (Web Audio API)
// ============================================================

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playTone(ctx, freq, start, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g);
  g.connect(Sound_getDestination(ctx));
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain,  start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'place') {
      // 短い上昇音
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(Sound_getDestination(ctx));
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.1);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.2);

    } else if (type === 'placeSpecial') {
      // A・K を置いたときだけの特別な音（きらめく上昇アルペジオ。通常の配置音より少し豪華にする）
      [784.00, 987.77, 1318.51, 1567.98].forEach((freq, i) => {
        const t = now + i * 0.08;
        playTone(ctx, freq,     t,        0.28, 0.17, 'triangle');
        playTone(ctx, freq * 2, t + 0.02, 0.2,  0.05, 'sine'); // 倍音でキラキラ感を追加
      });

    } else if (type === 'pass') {
      // 低い短い音
      playTone(ctx, 280, now, 0.18, 0.1, 'triangle');

    } else if (type === 'elim') {
      // 下降する悲しい音
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(Sound_getDestination(ctx));
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.55);

    } else if (type === 'win') {
      // 上昇ファンファーレ
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        playTone(ctx, freq, now + i * 0.13, 0.55, 0.18);
      });

    } else if (type === 'lose') {
      // 下降コード
      [392, 330.6, 293.7, 261.6].forEach((freq, i) => {
        playTone(ctx, freq, now + i * 0.14, 0.4, 0.13);
      });
    }
  } catch (e) { /* AudioContext が使えない環境ではスキップ */ }
}

/**
 * 結果画面(showResult)が表示される瞬間に鳴らす短いジングル。
 * 既存の win/lose/elim サウンド(ゲーム中のタイミングで鳴る)とは別に、
 * 「結果が出た」こと自体に気づいてもらうための演出。
 * @param {'win'|'place'|'elim'} outcome  'win'=1位 / 'place'=2〜4位で上がり / 'elim'=脱落
 */
function playResultJingle(outcome) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (outcome === 'win') {
      // 1位: 明るく弾むような短いファンファーレ
      const notes = [659.25, 783.99, 987.77, 1318.51]; // E5 → G5 → B5 → E6
      notes.forEach((f, i) => playTone(ctx, f, now + i * 0.09, 0.3, 0.2, 'triangle'));
      playTone(ctx, 1567.98, now + notes.length * 0.09, 0.45, 0.18, 'triangle'); // 締めの高音
    } else if (outcome === 'elim') {
      // 脱落: 少しコミカルに下降する短いジングル
      const notes = [440, 370, 293.7, 220];
      notes.forEach((f, i) => playTone(ctx, f, now + i * 0.1, 0.22, 0.12, 'sawtooth'));
    } else {
      // 2〜4位で上がり（脱落せず終局）: 控えめだが前向きな短いジングル
      const notes = [523.25, 587.33, 659.25];
      notes.forEach((f, i) => playTone(ctx, f, now + i * 0.11, 0.28, 0.15, 'sine'));
    }
  } catch (e) { /* AudioContext が使えない環境ではスキップ */ }
}

// ============================================================
//  BGM — 最初に置かれたカードのスートのBGMを再生し、
//  K または A が置かれると（誰の手番でも）そのスートのBGMに切り替わる
//  （ソリティアのファウンデーションBGMと同じ仕組み・同じ音源を使用）
// ============================================================

const SEVENS_BGM_FILES = {
  spades:   'sound/bgm/spades_迷子迷子のお嬢さん.mp3',
  hearts:   'sound/bgm/hearts_MusMus-BGM-167.mp3',
  clubs:    'sound/bgm/clubs_sweet_tooth.mp3',
  diamonds: 'sound/bgm/diamonds_私の薔薇には棘がない_2.mp3',
};

const SEVENS_BGM_VOLUME  = 0.45;
const SEVENS_BGM_FADE_MS = 400;

const sevensBgmAudios = {}; // suit -> HTMLAudioElement（使い回し）
let   sevensBgmActive  = null; // 現在再生中のスート名

function getSevensBgmAudio(suit) {
  if (!sevensBgmAudios[suit]) {
    const audio = new Audio(SEVENS_BGM_FILES[suit]);
    audio.loop    = true;
    audio.volume  = 0;
    audio.preload = 'auto';
    sevensBgmAudios[suit] = audio;
    if (typeof Sound_registerBgmAudio === 'function') Sound_registerBgmAudio(audio);
  }
  return sevensBgmAudios[suit];
}

/** 指定したスートのBGMを再生する（すでに同じスートが鳴っていれば何もしない） */
function playSevensBgm(suit) {
  if (!SEVENS_BGM_FILES[suit] || sevensBgmActive === suit) return;

  // 別のスートが鳴っていたら切り替え
  if (sevensBgmActive) {
    fadeSevensBgm(sevensBgmAudios[sevensBgmActive], 0, SEVENS_BGM_FADE_MS, (a) => {
      a.pause();
      a.currentTime = 0;
    });
  }

  sevensBgmActive = suit;
  const audio = getSevensBgmAudio(suit);
  audio.play().catch(() => { /* 自動再生制限は無視 */ });
  fadeSevensBgm(audio, SEVENS_BGM_VOLUME, SEVENS_BGM_FADE_MS);
}

/** BGMを止める（新しいゲームを始めたときなど） */
function stopSevensBgm() {
  if (!sevensBgmActive) return;
  const audio = sevensBgmAudios[sevensBgmActive];
  sevensBgmActive = null;
  if (!audio) return;

  fadeSevensBgm(audio, 0, 200, (a) => {
    a.pause();
    a.currentTime = 0;
  });
}

function fadeSevensBgm(audio, target, duration, onDone) {
  if (!audio) return;
  clearInterval(audio._sevensBgmFadeTimer);

  const start     = audio.volume;
  const startTime = performance.now();

  audio._sevensBgmFadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    audio.volume = start + (target - start) * t;
    if (t >= 1) {
      clearInterval(audio._sevensBgmFadeTimer);
      if (onDone) onDone(audio);
    }
  }, 30);
}

// ============================================================
//  スーツ絵 演出（ソリティアのファウンデーション演出と同じ仕組み）
//  七並べは7を起点に両方向へ順不同で伸びていくため、揃った枚数ではなく
//  「揃ったランクの集合」で管理し、A→Kの順に重ねて描画する。
// ============================================================

// 絵合わせ素材のパスは js/cards.js の getCardPicturePath/getSuitCompletePicturePath が
// カードの所持状態（グレー/カラー）に応じて自動で切り替える
const SUIT_PIC_THEME = {
  spades:   { color: '#a78bfa', emoji: '♠', label: 'Spades' },
  hearts:   { color: '#f87171', emoji: '♥', label: 'Hearts' },
  clubs:    { color: '#34d399', emoji: '♣', label: 'Clubs' },
  diamonds: { color: '#fbbf24', emoji: '♦', label: 'Diamonds' },
};
const RANK_ORDER = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function rankToFileName(rank) {
  return rank;
}

function suitPicPath(suit, fileRank) {
  if (fileRank === 'all') {
    return (typeof getSuitCompletePicturePath === 'function')
      ? getSuitCompletePicturePath(suit)
      : `images/cards/${suit}/A000_pitc/all.png`;
  }
  return (typeof getCardPicturePath === 'function')
    ? getCardPicturePath(suit, fileRank)
    : `images/cards/${suit}/A000_pitc/${fileRank}.png`;
}

// スートごとに「これまで場に出たランク」を記録
const suitPicture = {
  spades:   { placed: new Set(), hideTimer: null },
  hearts:   { placed: new Set(), hideTimer: null },
  clubs:    { placed: new Set(), hideTimer: null },
  diamonds: { placed: new Set(), hideTimer: null },
};

/** 新しいゲーム開始時に演出状態と背景をリセット */
function resetSuitPictures() {
  const layersEl = document.getElementById('suit-reveal-layers');
  if (layersEl) layersEl.innerHTML = '';

  Object.keys(suitPicture).forEach(suit => {
    clearTimeout(suitPicture[suit].hideTimer);
    suitPicture[suit].placed.clear();
    suitPicture[suit].hideTimer = null;
  });

  const overlay = document.getElementById('suit-reveal-overlay');
  if (overlay) overlay.className = 'suit-reveal-hidden';

  updateGameBackground(null);
}

/**
 * 場にカードが置かれたときに呼ぶ。
 * これまで揃ったランクをすべて重ねてポップアップ表示 + 背景に反映する。
 */
function triggerSuitPictureReveal(suit, rank) {
  const overlay  = document.getElementById('suit-reveal-overlay');
  const layersEl = document.getElementById('suit-reveal-layers');
  const labelEl  = document.getElementById('suit-reveal-label');
  if (!overlay || !layersEl || !labelEl) return;

  const state    = suitPicture[suit];
  const theme    = SUIT_PIC_THEME[suit];
  const fileRank = rankToFileName(rank);

  if (state.hideTimer) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }

  state.placed.add(fileRank);
  const complete = state.placed.size >= RANK_ORDER.length;

  // 揃っているランクをA→Kの順に重ねて描画（今置いたランクだけアニメーションさせる）
  layersEl.innerHTML = '';
  overlay.dataset.currentSuit = suit;

  const bgLayers = [];
  RANK_ORDER.forEach(r => {
    if (!state.placed.has(r)) return;
    bgLayers.push(suitPicPath(suit, r));

    const img = document.createElement('img');
    img.className = 'suit-layer';
    img.src = suitPicPath(suit, r);
    img.alt = `${suit} ${r}`;
    if (r !== fileRank) {
      img.style.animationDuration = '0s';
      img.style.opacity = '1';
      img.style.transform = 'translateY(0) scale(1)';
    }
    layersEl.appendChild(img);
  });

  updateGameBackground(bgLayers);

  labelEl.textContent = complete
    ? `${theme.emoji} ${theme.label} — Complete! 🎉`
    : `${theme.emoji} ${rank}`;
  labelEl.style.color = theme.color;

  overlay.classList.remove('suit-reveal-hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('suit-reveal-active'));
  });

  const displayDuration = complete ? 4000 : 1800;

  if (complete) {
    // 既にレイヤー・背景ともに「今デッキにセットされている13枚を正しく
    // 重ねた状態」になっているため、別の完成絵に差し替える必要はない。
    // 最上位レイヤーにグロー効果だけ追加して演出を強調する。
    setTimeout(() => {
      const topImg = layersEl.lastElementChild;
      if (topImg) {
        topImg.style.filter = `drop-shadow(0 0 20px ${theme.color})`;
      }
    }, 400);
  }

  state.hideTimer = setTimeout(() => {
    overlay.classList.remove('suit-reveal-active');
    setTimeout(() => {
      overlay.classList.add('suit-reveal-hidden');
      state.hideTimer = null;
    }, 350);
  }, displayDuration);
}

/**
 * ゲームの背景画像を更新する。画像URLの配列（重ねる順）を受け取り、
 * これまで揃った絵を重ねた状態を背景に表示する。null で既定背景に戻す。
 */
function updateGameBackground(imgUrls) {
  const body = document.body;

  if (typeof imgUrls === 'string') imgUrls = [imgUrls];

  if (!imgUrls || imgUrls.length === 0) {
    body.style.backgroundImage = '';
    return;
  }

  Promise.all(imgUrls.map(src => new Promise(resolve => {
    const img = new Image();
    img.onload  = resolve;
    img.onerror = resolve;
    img.src = src;
  }))).then(() => {
    const layered = imgUrls.slice().reverse().map(src => `url('${src}')`).join(', ');
    body.style.backgroundImage = layered;
  });
}

// ============================================================
//  ユーティリティ
// ============================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
